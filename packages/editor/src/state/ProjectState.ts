import { computed, makeObservable, observable } from "mobx";
import * as Y from "yjs";
import { NodeClipboardData, ProjectJSON } from "@uimix/node-data";
import { Project } from "../models/Project";
import { Selectable } from "../models/Selectable";
import { Node } from "../models/Node";
import { getIncrementalUniqueName } from "../utils/Name";
import { generateExampleNodes } from "../models/generateExampleNodes";

export class ProjectState {
  constructor() {
    this.project = new Project(this.doc);
    this.undoManager = this.project.createUndoManager();
    makeObservable(this);
  }

  readonly doc = new Y.Doc();
  readonly project: Project;
  @observable pageID: string | undefined;
  @computed get page(): Node | undefined {
    return this.pageID ? this.project.nodes.get(this.pageID) : undefined;
  }

  readonly undoManager: Y.UndoManager;

  // MARK: Selection

  @computed get selectedSelectables(): Selectable[] {
    return (
      this.page?.selectable?.children.flatMap((s) => s.selectedDescendants) ??
      []
    );
  }

  @computed get selectedNodes(): Node[] {
    const nodes: Node[] = [];
    for (const s of this.selectedSelectables) {
      if (s.idPath.length === 1) {
        nodes.push(s.originalNode);
      }
    }
    return nodes;
  }

  // MARK: Collapsing

  readonly collapsedPaths = observable.set<string>();

  // MARK: Nodes

  setupInitContent() {
    const pages = this.project.pages.all;
    if (pages.length === 0) {
      const page = this.project.nodes.create("page");
      page.name = "Page 1";
      this.project.node.append([page]);
      this.pageID = page.id;
      generateExampleNodes(page);
      if (this.project.componentURLs.length === 0) {
        this.project.componentURLs.push([
          "https://cdn.jsdelivr.net/gh/uimix-editor/uimix@ba0157d5/packages/sandbox/dist-components/components.js",
          "https://cdn.jsdelivr.net/gh/uimix-editor/uimix@ba0157d5/packages/sandbox/dist-components/style.css",
        ]);
      }
    } else {
      this.pageID = pages[0].id;
    }
    this.undoManager.clear();
  }

  loadJSON(projectJSON: ProjectJSON) {
    if (Object.keys(projectJSON.nodes).length) {
      this.project.loadJSON(projectJSON);
      const allPages = this.project.pages.all;
      if (!allPages.some((p) => p.id === this.pageID)) {
        this.pageID = allPages[0]?.id;
      }
    } else {
      this.project.node.clear();
      const page = this.project.nodes.create("page");
      page.name = "Page 1";
      this.project.node.append([page]);
      this.pageID = page.id;
    }
  }

  getNodeClipboardData(): NodeClipboardData | undefined {
    const selection = this.selectedSelectables;
    if (selection.length === 0) {
      return undefined;
    }

    const nodes = selection.map((s) => {
      if (s.originalNode.type === "component") {
        // TODO: improve component copy/paste
        // serialize component root instead
        return s.children[0].toJSON();
      }
      return s.toJSON();
    });
    return {
      uimixClipboardVersion: "0.0.1",
      type: "nodes",
      nodes,
      images: {}, // TODO
    };
  }

  async pasteNodeClipboardData(data: NodeClipboardData) {
    const getInsertionTarget = () => {
      const defaultTarget = {
        parent: this.page,
        next: undefined,
      };

      const selectedSelectables = this.selectedSelectables;
      let lastSelectable: Selectable | undefined =
        selectedSelectables[selectedSelectables.length - 1];
      while (lastSelectable && lastSelectable.idPath.length > 1) {
        lastSelectable = lastSelectable.parent;
      }
      if (!lastSelectable) {
        return defaultTarget;
      }

      const parent = lastSelectable?.parent;
      if (!parent) {
        return defaultTarget;
      }

      return {
        parent: parent.originalNode,
        next: lastSelectable.originalNode.nextSibling,
      };
    };

    const insertionTarget = getInsertionTarget();
    this.project.clearSelection();

    const selectables = data.nodes.map((json) =>
      Selectable.fromJSON(this.project, json)
    );

    insertionTarget.parent?.selectable.insertBefore(
      selectables,
      insertionTarget.next?.selectable,
      { fixPosition: false }
    );

    for (const selectable of selectables) {
      selectable.select();
    }

    // load images
    await Promise.all(
      Object.entries(data.images ?? {}).map(async ([hash, image]) => {
        if (this.project.imageManager.has(hash)) {
          return;
        }
        const blob = await fetch(image.url).then((res) => res.blob());
        await this.project.imageManager.insert(blob);
      })
    );
  }

  // MARK: Pages

  openPage(page: Node) {
    this.pageID = page.id;
  }

  createPage(name: string) {
    const existingFilePaths = new Set(
      this.project.pages.all.map((d) => d.name)
    );
    const newPath = getIncrementalUniqueName(existingFilePaths, name);

    const page = this.project.nodes.create("page");
    page.name = newPath;
    this.project.node.append([page]);

    this.undoManager.stopCapturing();
  }

  deletePageOrPageFolder(path: string) {
    const affectedPages = this.project.pages.affectedPagesForPath(path);
    const deletingCurrent = this.page
      ? affectedPages.includes(this.page)
      : false;

    // if (this.project.pages.count === affectedPages.length) {
    //   return;
    // }
    this.project.pages.deletePageOrPageFolder(path);

    if (deletingCurrent) {
      this.pageID = this.project.pages.all[0]?.id;
    }

    this.undoManager.stopCapturing();
  }

  renamePageOrPageFolder(path: string, newPath: string) {
    this.project.pages.renamePageOrPageFolder(path, newPath);
    this.undoManager.stopCapturing();
  }
}

export const projectState = new ProjectState();

// ProjectState does not support hot reloading
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
