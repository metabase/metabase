// The jest project that this worker serves. Its module mapping and transform
// rules apply to every spec file the worker runs.
import { projects, transforms } from "../jest-config.ts";

export const project =
  projects.find(({ name }) => name === process.env.NT_PROJECT) ?? projects[0];

const projectSources = new Map<string, boolean>();

/**
 * Whether the file is the project's own code, which the worker transforms and
 * evaluates again for each spec file.
 */
export function isProjectSource(file: string): boolean {
  let known = projectSources.get(file);
  if (known === undefined) {
    known = transforms(project, file);
    projectSources.set(file, known);
  }
  return known;
}
