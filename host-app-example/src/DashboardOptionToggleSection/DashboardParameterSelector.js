import { useDashboardParameters } from "metabase-embedding-sdk";
import { useMemo, useState } from "react";
import { xor } from "lodash";

export const DashboardParameterSelector = ({
  dashboardId,
  value: hiddenParameters,
  onChange,
  className,
}) => {
  const dashboardParameters = useDashboardParameters(dashboardId);
  const [isOpen, setIsOpen] = useState(false);

  const parameterList = useMemo(() => {
    return dashboardParameters.map(parameter => {
      return {
        name: parameter.name,
        value: parameter.slug,
      };
    });
  }, [dashboardParameters]);

  //   select multiple parameters
  return (
    <div className="tw-relative tw-z-50">
      <button className={className} onClick={() => setIsOpen(!isOpen)}>
        Hide Parameters
      </button>
      {isOpen && (
        <div className="tw-absolute tw-flex tw-flex-col tw-shadow-2xl tw-px-2 tw-py-2 tw-bg-gray-800 tw-border tw-border-gray-400">
          {parameterList.map(parameter => (
            <button
              key={parameter.value}
              onClick={() => {
                onChange(
                  hiddenParameters
                    ? xor(hiddenParameters, [parameter.value])
                    : xor(parameterList, [parameter.value]),
                );
              }}
              className={[
                hiddenParameters?.includes(parameter.value)
                  ? "tw-bg-gray-700 tw-line-through tw-text-gray-500"
                  : "tw-bg-gray-800",
                "tw-text-nowrap tw-whitespace-nowrap tw-px-2 tw-py-1 tw-font-bold hover:tw-bg-gray-500 tw-text-left",
              ]}
            >
              {parameter.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
