import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import Button from "metabase/core/components/Button";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import { Box, Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Parameter } from "metabase-types/api";

import ResponsiveParametersListS from "./ResponsiveParametersList.module.css";
import { SyncedParametersList } from "./SyncedParametersList";

interface ResponsiveParametersListProps {
  question: Question;
  parameters: Parameter[];
  setParameterValue: (parameterId: string, value: string) => void;
  setParameterIndex: (parameterId: string, parameterIndex: number) => void;
  enableParameterRequiredBehavior: boolean;
}

export const ResponsiveParametersList = ({
  question,
  parameters,
  setParameterValue,
  setParameterIndex,
  enableParameterRequiredBehavior,
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
    <Box w={isSmallScreen && mobileShowParameterList ? "100%" : undefined}>
      {isSmallScreen && (
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
        className={cx(ResponsiveParametersListS.ParametersListContainer, {
          [ResponsiveParametersListS.isSmallScreen]: isSmallScreen,
          [ResponsiveParametersListS.isShowingMobile]: mobileShowParameterList,
        })}
      >
        {isSmallScreen && (
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
          className={ResponsiveParametersListS.StyledParametersList}
          question={question}
          parameters={parameters}
          setParameterValue={setParameterValue}
          setParameterIndex={setParameterIndex}
          enableParameterRequiredBehavior={enableParameterRequiredBehavior}
          isEditing
          commitImmediately
        />
      </Box>
    </Box>
  );
};
