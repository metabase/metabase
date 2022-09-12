import { EntityId } from "metabase-types/types";
import { ParameterId } from "metabase-types/types/Parameter";

// Used to set values for question filters
// Example: "[\"dimension\",[\"field\",17,null]]"
type StringifiedDimension = string;

export type ClickBehaviorParameterMapping = Record<
  ParameterId | StringifiedDimension,
  {
    id: ParameterId | StringifiedDimension;
    source: {
      id: ParameterId | StringifiedDimension;
      name: string;
      type: "column" | "parameter";
    };
    target: {
      id: ParameterId | StringifiedDimension;
      type: "parameter" | "dimension";
    };
  }
>;

export type ClickBehaviorType =
  | "action"
  | "actionMenu"
  | "crossfilter"
  | "link";

export type CustomDestinationClickBehaviorLinkType =
  | "dashboard"
  | "question"
  | "url";

export interface CrossFilterClickBehavior {
  type: "crossfilter";
  parameterMapping?: ClickBehaviorParameterMapping;
}

export interface EntityCustomDestinationClickBehavior {
  type: "link";
  linkType: "dashboard" | "question";
  targetId: EntityId;
  parameterMapping?: ClickBehaviorParameterMapping;
}

export interface ArbitraryCustomDestinationClickBehavior {
  type: "link";
  linkType: "url";
  linkTemplate: string;
  linkTextTemplate?: string;
}

/**
 * This is a bit of a hack to allow us using click behavior code
 * for mapping _explicit_ action parameters. We don't actually use the click behavior though.
 * Remove this type and run the type-check to see the errors.
 */
interface WritebackActionClickBehavior {
  type: "action";
}

/**
 * Makes click handler use default drills.
 * This is virtual, i.e. if a card has no clickBehavior,
 * it'd behave as if it's an "actionMenu".
 */
export type ActionMenuClickBehavior = {
  type: "actionMenu";
};

export type CustomDestinationClickBehavior =
  | EntityCustomDestinationClickBehavior
  | ArbitraryCustomDestinationClickBehavior;

export type ClickBehavior =
  | ActionMenuClickBehavior
  | CrossFilterClickBehavior
  | CustomDestinationClickBehavior
  | WritebackActionClickBehavior;
