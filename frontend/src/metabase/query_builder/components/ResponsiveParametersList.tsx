import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { Box, Flex } from "metabase/ui";
import type { CardId, DashboardId, Parameter } from "metabase-types/api";

import ResponsiveParametersListS from "./ResponsiveParametersList.module.css";
import { SyncedParametersList } from "./SyncedParametersList";

interface ResponsiveParametersListProps {
  classNames?: {
    container?: string;
    parametersList?: string;
  };
  cardId?: CardId;
  dashboardId?: DashboardId;
  parameters: Parameter[];
  setParameterValue: (parameterId: string, value: string) => void;
  setParameterIndex?: (parameterId: string, parameterIndex: number) => void;
  enableParameterRequiredBehavior: boolean;
  commitImmediately?: boolean;
  isSortable?: boolean;
}

export const ResponsiveParametersList = ({
  classNames,
  cardId,
  dashboardId,
  parameters,
  setParameterValue,
  setParameterIndex,
  enableParameterRequiredBehavior,
  commitImmediately = true,
  isSortable,
}: ResponsiveParametersListProps) => {
  const [mobileShowParameterList, setShowMobileParameterList] = useState(false);
  const isSmallScreen = useIsSmallScreen();

  const handleFilterButtonClick = useCallback(() => {
    setShowMobileParameterList((mobileShow) => !mobileShow);
  }, []);

  const activeFilters = useMemo(() => {
    return parameters.filter((p) => !!p.value).length;
  }, [parameters]);

  return (
    <Box
      w={isSmallScreen && mobileShowParameterList ? "100%" : undefined}
      style={{ alignSelf: "center" }}
    >
      {parameters.length > 0 && isSmallScreen && (
        <Button
          className={ResponsiveParametersListS.filterButton}
          borderless
          primary
          icon="filter"
          onClick={handleFilterButtonClick}
        >
          {activeFilters > 0
            ? ngettext(
                msgid`${activeFilters} active filter`,
                `${activeFilters} active filters`,
                activeFilters,
              )
            : `Filters`}
        </Button>
      )}
      <Box
        py="sm"
        className={cx(
          ResponsiveParametersListS.ParametersListContainer,
          {
            [ResponsiveParametersListS.isSmallScreen]: isSmallScreen,
            [ResponsiveParametersListS.isShowingMobile]:
              mobileShowParameterList,
          },
          classNames?.container,
        )}
      >
        {parameters.length > 0 && isSmallScreen && (
          <Flex p="0.75rem 1rem" align="center" justify="space-between">
            <h3>{t`Filters`}</h3>
            <Button
              onlyIcon
              borderless
              icon="close"
              onClick={handleFilterButtonClick}
            />
          </Flex>
        )}
        <SyncedParametersList
          className={cx(
            ResponsiveParametersListS.StyledParametersList,
            classNames?.parametersList,
          )}
          cardId={cardId}
          dashboardId={dashboardId}
          parameters={parameters}
          setParameterValue={setParameterValue}
          setParameterIndex={setParameterIndex}
          enableParameterRequiredBehavior={enableParameterRequiredBehavior}
          isEditing
          isSortable={isSortable}
          commitImmediately={commitImmediately}
        />
      </Box>
    </Box>
  );
};
