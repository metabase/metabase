import cx from "classnames";
import { dissoc } from "icepick";
import { t } from "ttag";

import { Api, dashboardApi, useLazyGetXrayDashboardQuery } from "metabase/api";
import { invalidateTags, listTag } from "metabase/api/tags";
import { Link } from "metabase/common/components/Link";
import type {
  OmniPickerQuestionItem,
  OmniPickerTableItem,
} from "metabase/common/components/Pickers";
import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { useToast } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";

interface SetupGuideXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
}

export const SetupGuideXrayPickerModal = ({
  opened,
  onClose,
}: SetupGuideXrayPickerModalProps) => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const [fetchXrayDashboard] = useLazyGetXrayDashboardQuery();

  async function handleTableSelect(
    item: OmniPickerTableItem | OmniPickerQuestionItem,
  ) {
    onClose();
    if (item.model !== "table") {
      return;
    }

    try {
      const xrayDashboard = await fetchXrayDashboard({
        subPath: `table/${item.id}`,
      }).unwrap();

      const { data: savedDashboard } = await dispatch(
        dashboardApi.endpoints.saveDashboard.initiate(
          dissoc(xrayDashboard, "id"),
        ),
      );

      if (!savedDashboard) {
        throw new Error("Failed to save x-ray dashboard");
      }

      dispatch(
        Api.util.invalidateTags([
          ...invalidateTags(null, ["collection"]),
          listTag("setup-guide-checklist"),
        ]),
      );

      const savedDashboardUrl = Urls.dashboard(savedDashboard);
      sendToast({
        message: (
          <div className={cx(CS.flex, CS.alignCenter)}>
            {t`Your dashboard was saved`}
            <Link
              className={cx(CS.link, CS.textBold, CS.ml1)}
              to={savedDashboardUrl}
            >
              {t`See it`}
            </Link>
          </div>
        ),
        icon: "dashboard",
      });
    } catch {
      sendToast({
        variant: "negative",
        message: t`Failed to create dashboard`,
      });
    }
  }

  if (!opened) {
    return null;
  }

  return (
    <DataPickerModal
      title={t`Choose a table to generate a dashboard`}
      models={["table"]}
      onChange={handleTableSelect}
      onClose={onClose}
      options={{
        hasLibrary: false,
        hasRootCollection: false,
        hasPersonalCollections: false,
      }}
    />
  );
};
