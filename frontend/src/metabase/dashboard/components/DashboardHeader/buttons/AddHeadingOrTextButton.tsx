import { t } from "ttag";

import {
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
} from "metabase/dashboard/actions";
import { TextOptionsButton } from "metabase/dashboard/components/TextOptions/TextOptionsButton";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui";

export const AddHeadingOrTextButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

  const onAddMarkdownBox = () => {
    if (dashboard) {
      dispatch(
        addMarkdownDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  const onAddHeading = () => {
    if (dashboard) {
      dispatch(
        addHeadingDashCardToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
        }),
      );
    }
  };

  return (
    <Tooltip label={t`Add a heading or text`}>
      <span>
        <TextOptionsButton
          onAddMarkdown={onAddMarkdownBox}
          onAddHeading={onAddHeading}
        />
      </span>
    </Tooltip>
  );
};
