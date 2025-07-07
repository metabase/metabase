import { useMemo } from "react";

import { Flex } from "metabase/ui";

import type { DashboardParameterListProps } from "../DashboardParameterList";
import { DashboardParameterList } from "../DashboardParameterList";
import { MoreFiltersDropdown } from "../MoreFiltersDropdown";

export interface EnhancedParameterListProps
  extends DashboardParameterListProps {
  // We'll add new props here later
}

export function EnhancedParameterList(props: EnhancedParameterListProps) {
  const { parameters, ...otherProps } = props;

  // Split parameters into active (with values) and inactive (without values)
  const { activeParameters, inactiveParameters } = useMemo(() => {
    if (!parameters) {
      return { activeParameters: [], inactiveParameters: [] };
    }

    const active = parameters.filter((p) => p.value != null && p.value !== "");
    const inactive = parameters.filter(
      (p) => p.value == null || p.value === "",
    );

    return {
      activeParameters: active,
      inactiveParameters: inactive,
    };
  }, [parameters]);

  // eslint-disable-next-line no-console
  console.log(
    "🚀 Active parameters:",
    activeParameters.length,
    "| Inactive parameters:",
    inactiveParameters.length,
  );

  return (
    <Flex align="end" justify="space-between" gap="sm" w="100%">
      {/* Left side: Active filter widgets */}
      <Flex align="end" gap="sm" style={{ flex: 1 }}>
        {activeParameters.length > 0 && (
          <DashboardParameterList
            parameters={activeParameters}
            {...otherProps}
          />
        )}
      </Flex>

      {/* Right side: More filters dropdown */}
      {inactiveParameters.length > 0 && (
        <MoreFiltersDropdown parameters={inactiveParameters} {...otherProps} />
      )}
    </Flex>
  );
}
