import gitignoreTemplate from "./templates/.gitignore?raw";
import indexTsxTemplate from "./templates/index.tsx?raw";
import packageJsonTemplate from "./templates/package.json?raw";
import tsconfigTemplate from "./templates/tsconfig.json?raw";
import viteConfigTemplate from "./templates/vite.config.ts?raw";

const NAME_PLACEHOLDER = "__CUSTOM_VIZ_NAME__";

function replaceName(template: string, name: string): string {
  return template.split(NAME_PLACEHOLDER).join(name);
}

export function generatePackageJson(name: string): string {
  return replaceName(packageJsonTemplate, name);
}

export function generateViteConfig(): string {
  return viteConfigTemplate;
}

export function generateTsConfig(): string {
  return tsconfigTemplate;
}

export function generateIndexTsx(name: string): string {
  return replaceName(indexTsxTemplate, name);
}

export function generateGitignore(): string {
  return gitignoreTemplate;
}
