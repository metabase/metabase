import { jt, t } from "ttag";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import {
  filterItems,
  type JsonStructure as CommandPaletteActions,
  JsonStructureItem,
} from "react-cmdk";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModal, closeModal } from "metabase/redux/ui";
import * as Urls from "metabase/lib/urls";
import { Icon, IconName } from "metabase/ui";

export type CommandPalettePageId = "root" | "admin_settings";

export const useCommandPalette = ({
  query,
  setPage,
  setQuery,
}: {
  query: string;
  setPage: Dispatch<SetStateAction<CommandPalettePageId>>;
  setQuery: Dispatch<SetStateAction<string>>;
}) => {
  const dispatch = useDispatch();

  const openNewModal = useCallback(
    (modalId: string) => {
      dispatch(closeModal());
      dispatch(setOpenModal(modalId));
    },
    [dispatch],
  );

  const palettifyThese = [
    ...document.querySelectorAll("[data-palette], [data-palette-name]"),
  ];

  const getContextualActions = (): Array<JsonStructureItem> => {
    // Don't include contextual actions when another modal is open
    if (document.querySelector(".Modal-backdrop")) return [];
    const actions = palettifyThese.map((el, index) => {
      return {
        id: "contextual_action_" + index,
        children:
          el.getAttribute("data-palette-name") ||
          el.getAttribute("aria-label") ||
          el.textContent?.trim() ||
          "",
        icon: () => (
          <Icon
            name={(el.getAttribute("data-palette-icon") as IconName) || "click"}
          />
        ),
        onClick: () => {
          (el as HTMLButtonElement).click();
        },
      };
    });
    return actions;
  };

  const defaultActions = useMemo<CommandPaletteActions>(() => {
    const actions: CommandPaletteActions = [
      {
        id: "new",
        heading: "",
        items: [
          {
            id: "new_collection",
            children: t`New collection`,
            icon: () => <Icon name="collection" />,
            onClick: () => {
              openNewModal("collection");
            },
          },
          {
            id: "new_dashboard",
            children: t`New dashboard`,
            icon: () => <Icon name="dashboard" />,
            onClick: () => {
              openNewModal("dashboard");
            },
          },
          {
            id: "new_question",
            children: t`New question`,
            icon: () => <Icon name="insight" />,
            onClick: () => {
              dispatch(closeModal());
              dispatch(
                push(
                  Urls.newQuestion({
                    mode: "notebook",
                    creationType: "custom_question",
                  }),
                ),
              );
            },
          },
          {
            id: "search_docs",
            children: query
              ? jt`${(
                  <span className="truncate max-w-md dark:text-white">
                    Search documentation for&nbsp;
                    <strong>&ldquo;{query}&rdquo;</strong>
                  </span>
                )}`
              : t`Metabase documentation`,
            keywords: [query], // always match the query
            icon: () => <Icon name="document" />,
            closeOnSelect: false,
            onClick: () => {
              const host = "https://www.metabase.com";
              if (query) {
                const params = new URLSearchParams({ query });
                // TODO: find the documentation search URL in the right way
                window.open(`${host}/search?${params}`);
              } else {
                window.open(`${host}/docs/latest`);
              }
            },
          },
          {
            id: "admin_settings",
            children: t`Admin settings`,
            icon: () => <Icon name="gear" />,
            closeOnSelect: false,
            onClick: () => {
              setQuery("");
              setPage("admin_settings");
            },
          },
        ],
      },
    ];
    const contextualActions = getContextualActions();
    if (contextualActions.length) {
      actions.unshift({
        id: "contextual_actions",
        heading: "On this page",
        items: contextualActions,
      });
    }
    return actions;
  }, [query, dispatch, setPage, openNewModal, setQuery, palettifyThese]);

  const adminSettingsActions = useMemo<CommandPaletteActions>(
    () => [
      {
        id: "admin_settings",
        items: [
          {
            id: "back",
            children: t`Back`,
            icon: () => <Icon name="arrow_left" />,
            closeOnSelect: false,
            onClick: () => {
              setPage("root");
            },
          },
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
            onClick: () => dispatch(push("/admin/settings/public-sharing")),
          },
          {
            id: "embedding",
            children: t`Embedding`,
            icon: () => <Icon name="gear" />,
            onClick: () =>
              dispatch(push("/admin/settings/embedding-in-other-applications")),
          },
          {
            id: "license_and_billing",
            children: t`License and Billing`,
            icon: () => <Icon name="gear" />,
            onClick: () => dispatch(push("/admin/settings/license")),
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
    [dispatch, setPage],
  );

  return {
    defaultActions: filterItems(defaultActions, query),
    adminSettingsActions: filterItems(adminSettingsActions, query),
  };
};
