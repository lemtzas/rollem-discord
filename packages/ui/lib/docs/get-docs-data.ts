import fs from "fs";
import path from "path";
import matter from "gray-matter";

import { chain, flatMapDeep, sortBy } from "lodash";


const docsDirectory = path.join(process.cwd(), "docs");

export interface DocsData {
  id: string;
  route: string[];
  layout: "default";
  title: string;
  parent: string;
  nav_order: number;
  permalink: string;
}

export interface DocsDataTree {
  id: string;
  route: string[];
  item: DocsData;
  children?: DocsDataTree[];
}

/** Gets the docs data. Sorted. Recursive. */
export function getSortedDocsData(): DocsDataTree[] {
  const docs = getSortedDocsDataInternal(docsDirectory);
  docs.forEach(v => v.route.unshift('doc'));
  return docs;
}

/** Gets the docs data from a specific folder. Sorted. Recursive. */
function getSortedDocsDataInternal(
  directoryName: string,
  parentRoute: string[] = []
): DocsDataTree[] {
  const fileNames = fs.readdirSync(directoryName);
  // console.log(fileNames);
  return fileNames
    .map((fileName) => {
      const pathId = fileName.replace(/\.md$/, "");
      const fullPath = path.join(directoryName, fileName);
      const pathStats = fs.lstatSync(fullPath);
      const route = [...parentRoute, pathId];
      if (pathStats.isDirectory()) {
        const childDocs = getSortedDocsDataInternal(fullPath, route);
        const childDocsSorted = sortBy(childDocs, (d) => d.item.nav_order);
        const indexDoc = tryGetSingleDocData(
          path.join(directoryName, fileName),
          route
        );
        return {
          id: pathId,
          route: route,
          item: indexDoc,
          children: childDocsSorted,
        };
      } else {
        if (parentRoute.length > 0 && pathId === "index") {
          // the root index route
          return null;
        }

        return {
          id: pathId,
          route: route,
          item: tryGetSingleDocData(directoryName, parentRoute, fileName),
          children: null,
        };
      }
    })
    .filter((v) => !!v);
}

export function tryGetSingleDocData(
  directoryName: string,
  parentRoute: string[] = [],
  fileName: string = "index.md"
): DocsData {
  const pathId = fileName.replace(/\.md$/, "");
  const fullRoute = [
    ...parentRoute,
    ...(fileName !== "index.md" ? [pathId] : []),
  ];
  const fullFilePath = path.join(directoryName, fileName);
  const pathStats = fs.lstatSync(fullFilePath);
  if (!pathStats.isFile()) {
    return null;
  }

  const fileContents = fs.readFileSync(fullFilePath, "utf8");
  const matterResult = matter(fileContents);

  return <DocsData>(<undefined>{
    id: pathId,
    route: fullRoute,
    fullFilePath: fullFilePath,
    ...(matterResult.data as { date: string; title: string }),
  });
}

export function getAllDocIds() {
  const docData = getSortedDocsData();
  const flattenedDocData = flatMapDeep(docData);
  const flat2 = [
    ...chain(flattenedDocData)
      .map((v) => v?.item)
      .filter((v) => !!v)
      .value(),
    ...chain(flattenedDocData)
      .flatMap((v) => v?.children)
      .map((v) => v?.item)
      .filter(v => !!v)
      .value(),
  ];
  return flat2
    .filter((v) => !!v)
    .map((docData) => {
      return {
        params: {
          id: docData.route,
        },
      };
    });
}

export async function getDocData(id: string[]) {
  id = id.filter((v) => v !== "." && v !== "..");
  const fileContents = getPathContents(id);

  // Use gray-matter to parse the post metadata section
  const matterResult = matter(fileContents);

  // Combine the data with the id and contentReact
  const result = {
    id,
    content: matterResult.content,
    ...(matterResult.data as { date: string; title: string }),
  };

  delete result["orig"];

  return result;
}

function getPathContents(id: string[]): string {
  id = id.filter((v) => v !== "." && v !== "..");
  if (id.length > 0) {
    const childPath = path.join(docsDirectory, ...id) + ".md";
    if (fs.existsSync(childPath)) {
      if (fs.statSync(childPath).isFile()) {
        return fs.readFileSync(childPath, "utf8");
      }
    }
  }

  const indexPath = path.join(docsDirectory, ...id, "index.md");
  if (fs.existsSync(indexPath)) {
    if (fs.statSync(indexPath).isFile()) {
      return fs.readFileSync(indexPath, "utf8");
    }
  }

  throw new Error(`404: ${indexPath}`);
}

export function makePropsAllDocData(): { allDocsData: DocsDataTree[] } {
  return {
    allDocsData: getSortedDocsData(),
  };
}