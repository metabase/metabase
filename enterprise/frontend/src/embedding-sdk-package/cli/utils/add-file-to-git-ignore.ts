import fs from "fs/promises";

const GITIGNORE_PATH = ".gitignore";

/**
 * Adds the credential file to .gitignore if exists.
 */
export async function addFileToGitIgnore(fileName: string) {
  try {
    // Check if .gitignore exists
    await fs.access(GITIGNORE_PATH);

    let gitignoreContent = await fs.readFile(GITIGNORE_PATH, "utf-8");

    // If the credential file is not in .gitignore, add it.
    if (!gitignoreContent.includes(fileName)) {
      gitignoreContent += `\n${fileName}`;
      await fs.writeFile(GITIGNORE_PATH, gitignoreContent);
    }
  } catch (error) {
    // skip if .gitignore does not exist
  }
}
