import * as vscode from "vscode";
import { WorkspaceLoader } from "uimix/src/project/WorkspaceLoader";
import { FileAccess, Stats } from "uimix/src/project/FileAccess";
import { ProjectData } from "@uimix/model/src/collaborative";
import * as path from "path";
import { getPageID } from "@uimix/model/src/data/util";
import { codeAssetsDestination } from "uimix/src/codeAssets/constants";

let lastSaveTime = 0;

class VSCodeFileAccess implements FileAccess {
  constructor(rootFolder: vscode.WorkspaceFolder) {
    this.rootFolder = rootFolder;
  }

  readonly rootFolder: vscode.WorkspaceFolder;

  get rootPath() {
    return this.rootFolder.uri.fsPath;
  }

  watch(pattern: string, onChange: () => void): () => void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.rootFolder, pattern)
    );

    const _onChange = () => {
      if (Date.now() - lastSaveTime > 1000) {
        onChange();
      }
    };

    watcher.onDidChange(_onChange);
    watcher.onDidCreate(_onChange);
    watcher.onDidDelete(_onChange);
    return () => watcher.dispose();
  }

  async glob(pattern: string): Promise<string[]> {
    const urls = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.rootFolder, pattern),
      // TODO: configure excludes
      "**/node_modules/**"
    );
    return urls.map((url) => url.fsPath);
  }

  async stat(filePath: string): Promise<Stats | undefined> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return {
        type: stat.type & vscode.FileType.Directory ? "directory" : "file",
      };
    } catch (e) {
      return undefined;
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    lastSaveTime = Date.now();

    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data);
  }

  async readFile(filePath: string): Promise<Buffer> {
    const url = vscode.Uri.file(filePath);
    return Buffer.from(await vscode.workspace.fs.readFile(url));
  }

  async remove(filePath: string): Promise<void> {
    // no-op for now (vscode extension doesn't need to delete files)
  }
}

export class WorkspaceData {
  static async load(rootFolder: vscode.WorkspaceFolder) {
    const loader = new WorkspaceLoader(new VSCodeFileAccess(rootFolder));
    const result = await loader.load();
    if (result.problems.length) {
      const message =
        `Error loading workspace:\n` +
        result.problems
          .map((problem) => `${problem.filePath}:\n  ${String(problem.error)}`)
          .join("\n");
      vscode.window.showErrorMessage(message);
    }

    return new WorkspaceData(rootFolder, loader);
  }

  constructor(rootFolder: vscode.WorkspaceFolder, loader: WorkspaceLoader) {
    this.rootFolder = rootFolder;
    this.loader = loader;
    this.disposables.push({
      dispose: loader.watch(() => {}),
    });

    this.codeAssetsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        this.rootFolder,
        `**/${codeAssetsDestination.directory}/{${codeAssetsDestination.js},${codeAssetsDestination.css}}`
      )
    );

    const onChange = (uri: vscode.Uri) => {
      const projectPath = uri.fsPath.replace(
        new RegExp(
          `\\/${codeAssetsDestination.directory.replace(/\//g, "\\/")}.*`
        ),
        ""
      );
      this._onDidChangeCodeAssets.fire(projectPath);
    };
    this.codeAssetsWatcher.onDidCreate(onChange);
    this.codeAssetsWatcher.onDidChange(onChange);
    this.codeAssetsWatcher.onDidDelete(onChange);
    this.disposables.push(this.codeAssetsWatcher);
  }

  readonly rootFolder: vscode.WorkspaceFolder;
  readonly loader: WorkspaceLoader;

  readonly codeAssetsWatcher: vscode.FileSystemWatcher;
  private readonly _onDidChangeCodeAssets = new vscode.EventEmitter<string>();
  readonly onDidChangeCodeAssets = this._onDidChangeCodeAssets.event;

  getDataForProject(projectPath: string): ProjectData {
    return this.loader.getOrCreateProject(projectPath).project.data;
  }

  getDataForFile(uri: vscode.Uri): ProjectData {
    return this.getDataForProject(this.loader.projectPathForFile(uri.fsPath));
  }

  pageIDForFile(uri: vscode.Uri): string {
    // Important TODO: fix paths in Windows!!
    const relativePath = path.relative(
      this.loader.projectPathForFile(uri.fsPath),
      uri.fsPath
    );
    return getPageID(relativePath.replace(/\.uimix$/, ""));
  }

  projectPathForFile(uri: vscode.Uri): string {
    return this.loader.projectPathForFile(uri.fsPath);
  }

  async save(uri: vscode.Uri) {
    const projectPath = this.loader.projectPathForFile(uri.fsPath);
    try {
      await this.loader.save(projectPath);
    } catch (e) {
      vscode.window.showErrorMessage(`Error saving project:\n${e}`);
    }
  }

  readonly disposables: vscode.Disposable[] = [];

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
