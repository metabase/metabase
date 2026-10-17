// Node's module loader, typed for the parts the runner uses: synchronous
// module hooks, which are newer than the installed @types/node, and _compile
// and _load, which are internal to the CommonJS loader.
import Module, {
  type LoadFnOutput,
  type LoadHookContext,
  type ResolveFnOutput,
  type ResolveHookContext,
} from "node:module";

export type ResolveContext = ResolveHookContext;
export type ResolveResult = ResolveFnOutput;

type ModuleHooks = {
  resolve: (
    specifier: string,
    context: ResolveHookContext,
    nextResolve: (
      specifier: string,
      context?: ResolveHookContext,
    ) => ResolveFnOutput,
  ) => ResolveFnOutput;
  load: (
    url: string,
    context: LoadHookContext,
    nextLoad: (url: string, context?: LoadHookContext) => LoadFnOutput,
  ) => LoadFnOutput;
};

type Compile = (
  this: NodeJS.Module,
  content: string,
  filename: string,
  ...rest: unknown[]
) => unknown;
type Load = (
  this: unknown,
  request: string,
  parent: NodeJS.Module | undefined,
  isMain: boolean,
) => unknown;

// Node 22.15 and later have these. The repository's Node version is newer, and
// its types are older.
const moduleWithHooks = Module as typeof Module & {
  registerHooks(hooks: ModuleHooks): { deregister(): void };
  _load: Load;
};
// _compile is on every CommonJS module, and internal to Node.
const modulePrototype = Module.prototype as Module & { _compile: Compile };

export function registerHooks(hooks: ModuleHooks): void {
  moduleWithHooks.registerHooks(hooks);
}

/**
 * Replaces the function that evaluates a CommonJS module's source. The
 * replacement gets the original to call.
 */
export function wrapCompile(wrap: (compile: Compile) => Compile): void {
  modulePrototype._compile = wrap(modulePrototype._compile);
}

/**
 * Replaces the function behind every require(). The replacement gets the
 * original to call.
 */
export function wrapLoad(wrap: (load: Load) => Load): void {
  moduleWithHooks._load = wrap(moduleWithHooks._load);
}
