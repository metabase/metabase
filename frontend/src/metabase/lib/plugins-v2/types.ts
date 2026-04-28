/**
 * Augment this interface from feature files that own a hook:
 *
 *   declare module "metabase/lib/plugins-v2/types" {
 *     interface HookRegistry {
 *       "my.hook.name": (params: { foo: string }) => string;
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HookRegistry {}
