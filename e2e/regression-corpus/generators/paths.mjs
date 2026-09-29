import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(process.env.REPO_ROOT || path.join(HERE, "../../.."));
export const WORKTREE = path.resolve(process.env.CORPUS_WORKTREE || REPO_ROOT);
export const CORPUS_OUT = path.resolve(process.env.CORPUS_OUT || path.join(REPO_ROOT, "local/regression-corpus/overnight"));
export const DATA_DIR = path.join(CORPUS_OUT, "generators");
export const MUTANTS = path.join(CORPUS_OUT, "mutants");
export const BUGS = path.join(REPO_ROOT, "e2e/regression-corpus/bugs");
