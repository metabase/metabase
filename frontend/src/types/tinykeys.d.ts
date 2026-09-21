// Ambient declaration for `tinykeys` whose `package.json` "exports" field
// omits the `types` condition, making the `.d.ts` invisible to bundler-mode
// module resolution. Re-exports the upstream `.d.ts` directly.
//
// TODO: remove once the package fixes its package.json

declare module "tinykeys" {
  export type KeyBindingPress = [mods: string[], key: string | RegExp];
  export interface KeyBindingMap {
    [keybinding: string]: (event: KeyboardEvent) => void;
  }
  export interface KeyBindingHandlerOptions {
    timeout?: number;
  }
  export interface KeyBindingOptions extends KeyBindingHandlerOptions {
    event?: "keydown" | "keyup";
    capture?: boolean;
  }
  export function parseKeybinding(str: string): KeyBindingPress[];
  export function matchKeyBindingPress(
    event: KeyboardEvent,
    binding: KeyBindingPress,
  ): boolean;
  export function createKeybindingsHandler(
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingHandlerOptions,
  ): EventListener;
  export function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingOptions,
  ): () => void;
}
