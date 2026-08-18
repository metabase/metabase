/**
 * Defines a source-controlled data app action. `action` names the generated
 * action the app runs. `copiedActionId` is generated state — synchronization
 * writes it back, so never set or edit it by hand.
 */
export function defineAction<
  const TDefinition extends {
    action: { id: number; parameters: readonly unknown[] };
    copiedActionId?: number;
  },
>(definition: TDefinition): TDefinition {
  return definition;
}
