import { t } from "ttag";
import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import { push } from "react-router-redux";
import {
  filterItems,
  type JsonStructure as CommandPaletteActions,
} from "react-cmdk";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";
import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";

export type CommandPalettePageId = "root" | "admin_settings";

export const useCommandPalette = ({
  query,
  setPage,
}: {
  query: string;
  setPage: Dispatch<SetStateAction<CommandPalettePageId>>;
}) => {
  const dispatch = useDispatch();

  const defaultActions = useMemo<CommandPaletteActions>(
    () => [
      {
        id: "new",
        items: [
          {
            id: "new_collection",
            children: t`New collection`,
            icon: () => <Icon name="collection" />,
            onClick: () => dispatch(setOpenModal("collection")),
          },
          {
            id: "new_dashboard",
            children: t`New dashboard`,
            icon: () => <Icon name="dashboard" />,
            onClick: () => dispatch(setOpenModal("dashboard")),
          },
          {
            id: "new_question",
            children: t`New question`,
            icon: () => <Icon name="question" />,
            onClick: () =>
              dispatch(
                push(
                  Urls.newQuestion({
                    mode: "notebook",
                    creationType: "custom_question",
                  }),
                ),
              ),
          },
          {
            id: "admin_settings",
            children: t`Admin settings`,
            icon: () => <Icon name="gear" />,
            onClick: () => setPage("admin_settings"),
          },
        ],
      },
    ],
    [dispatch, setPage],
  );

  const adminSettingsActions = useMemo<CommandPaletteActions>(
    () => [
      {
        id: "admin_settings",
        items: [
          {
            id: "setup",
            children: t`Setup`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/setup")),
          },
          {
            id: "general",
            children: t`General`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/general")),
          },
          {
            id: "updates",
            children: t`Updates`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/updates")),
          },
          {
            id: "email",
            children: t`Email`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/email")),
          },
          {
            id: "slack",
            children: t`Slack`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/slack")),
          },
          {
            id: "authentication",
            children: t`Authentication`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/authentication")),
          },
          {
            id: "maps",
            children: t`Maps`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/maps")),
          },
          {
            id: "localization",
            children: t`Localization`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/localization")),
          },
          {
            id: "uploads",
            children: t`Uploads`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/uploads")),
          },
          {
            id: "public_sharing",
            children: t`Public Sharing`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/public_sharing")),
          },
          {
            id: "embedding",
            children: t`Embedding`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/embedding")),
          },
          {
            id: "license_and_billing",
            children: t`License and Billing`,
            icon: () => <Icon name="gear" />,
            onClick: () =>
              dispatch(push("/admin/settings/license_and_billing")),
          },
          {
            id: "caching",
            children: t`Caching`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/caching")),
          },
        ],
      },
    ],
    [dispatch],
  );

  return {
    defaultActions: filterItems(defaultActions, query),
    adminSettingsActions: filterItems(adminSettingsActions, query),
  };
};
