import { useCallback } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { Button, Flex } from "metabase/ui";
import { getVisualizationType } from "metabase/visualizer/selectors";
import {
  setDisplay,
  toggleVizSettingsSidebar,
} from "metabase/visualizer/visualizer.slice";
import type { VisualizationDisplay } from "metabase-types/api";

import { VisualizationPicker } from "../VisualizationPicker";

import S from "./Footer.module.css";

export function Footer() {
  const dispatch = useDispatch();
  const display = useSelector(getVisualizationType);

  const handleChangeDisplay = useCallback(
    (nextDisplay: string) => {
      dispatch(setDisplay(nextDisplay as VisualizationDisplay));
    },
    [dispatch],
  );
  return (
    <Flex className={S.footer} px="xl" py="md">
      <VisualizationPicker value={display} onChange={handleChangeDisplay} />
      <Button
        ml="auto"
        onClick={() => dispatch(toggleVizSettingsSidebar())}
      >{t`Settings`}</Button>
    </Flex>
  );
}
