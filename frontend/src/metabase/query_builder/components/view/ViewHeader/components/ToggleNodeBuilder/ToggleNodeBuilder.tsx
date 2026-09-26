import { useMemo } from "react";
import { t } from "ttag";

import { trackNodeBuilderToggled } from "metabase/querying/notebook/components/NodeBuilder/analytics";
import { getUnsupportedReason } from "metabase/querying/notebook/components/NodeBuilder/graph";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Flex, Icon, Switch, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getQuestion, getUiControls } from "../../../../../store/selectors";

type ShouldRenderOpts = {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
};

const SWITCH_STYLES = {
  root: { flexShrink: 0 },
  body: { alignItems: "center" },
  label: { whiteSpace: "nowrap", cursor: "pointer", fontWeight: 600 },
} as const;

export const ToggleNodeBuilder = (): JSX.Element => {
  const dispatch = useDispatch();
  const { isShowingNodeBuilder }: { isShowingNodeBuilder: boolean } =
    useSelector(getUiControls);
  const question = useSelector(getQuestion);
  const unsupportedReason = useMemo(
    () => (question ? getUnsupportedReason(question.query()) : null),
    [question],
  );
  const isAvailable = unsupportedReason == null;

  const handleChange = (checked: boolean) => {
    trackNodeBuilderToggled(checked, question?.id() ?? null);
    dispatch(
      setUIControls({
        isShowingNodeBuilder: checked,
        ...(checked ? { isShowingNotebookNativePreview: true } : {}),
      }),
    );
  };

  return (
    <Tooltip
      label={
        isAvailable
          ? t`Build the query on a node canvas`
          : t`The node-based builder can't show this query yet: it has ${unsupportedReason}.`
      }
      position="top"
    >
      <Flex align="center" gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
        <Icon name="network" size={14} c="text-secondary" />
        <Switch
          checked={isShowingNodeBuilder && isAvailable}
          disabled={!isAvailable}
          labelPosition="left"
          label={t`Node-based builder`}
          aria-label={t`Node-based builder`}
          data-testid="toggle-node-builder"
          styles={SWITCH_STYLES}
          onChange={(event) => handleChange(event.currentTarget.checked)}
        />
      </Flex>
    </Tooltip>
  );
};

ToggleNodeBuilder.shouldRender = ({
  question,
  queryBuilderMode,
}: ShouldRenderOpts) => {
  const { isNative } = Lib.queryDisplayInfo(question.query());
  return queryBuilderMode === "notebook" && !isNative && !question.isArchived();
};
