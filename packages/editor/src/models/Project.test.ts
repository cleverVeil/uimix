import { describe, expect, it } from "vitest";
import { Project } from "./Project";
import * as path from "path";
import { ProjectFiles } from "../../../cli/src/project/ProjectFiles";
import { NodeFileAccess } from "../../../cli/src/project/NodeFileAccess";

describe(Project.name, () => {
  describe("loadJSON", () => {
    it("works", async () => {
      const rootDir = path.resolve("../sandbox");
      const projectFiles = await ProjectFiles.load(
        new NodeFileAccess(rootDir),
        { filePattern: "src/components.uimix" }
      );
      const projectJSON = projectFiles.json;

      const project = new Project();
      project.loadJSON(projectJSON);

      expect([...project.nodes.data.keys()]).toMatchSnapshot();
      expect([...project.selectables.stylesData.keys()]).toMatchSnapshot();
      expect(project.imageManager.images.toJSON()).toMatchSnapshot();
      expect(project.componentURLs).toMatchSnapshot();
      expect(project.toJSON()).toEqual(projectJSON);
    });
  });

  describe("toJSON", () => {
    it("works ", async () => {
      const rootDir = path.resolve("../sandbox");
      const projectFiles = await ProjectFiles.load(
        new NodeFileAccess(rootDir),
        {
          filePattern: "src/components.uimix",
        }
      );
      const projectJSON = projectFiles.json;

      const project = new Project();
      project.loadJSON(projectJSON);

      const outputJSON = project.toJSON();

      expect(outputJSON).toEqual(projectJSON);
    });
  });
});
