import { jt, t } from "ttag";
import _ from "underscore";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useEffect } from "react";
import { push } from "react-router-redux";
import {
  filterItems,
  type JsonStructure as CommandPaletteActions,
} from "react-cmdk";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setOpenModal, closeModal } from "metabase/redux/ui";
import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";
import { getContextualPaletteActions } from "metabase/selectors/app";
import { getSections } from "metabase/admin/settings/selectors";
import { reloadSettings } from "metabase/admin/settings/settings";

export type CommandPalettePageId = "root" | "admin_settings";

type AdminSetting = {
  key: string;
  display_name: string;
  description: string | null;
  type: "string";
  path: string;
};

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
  const adminSections = useSelector<AdminSetting>(getSections);

  useEffect(() => {
    dispatch(reloadSettings());
  }, [dispatch]);

  const adminSectionsSearchMap = useMemo(
    () =>
      Object.keys(adminSections).reduce<AdminSetting[]>((memo, key) => {
        const settings = adminSections[key].settings || [];
        const path = `/admin/settings/${key}`;

        return [
          ...memo,
          ...settings
            .filter(s => s.display_name)
            .map(s => ({
              name: s.display_name || "",
              description: s.description,
              path,
              key: s.key,
              displayName: `${key[0].toUpperCase()}${key.slice(1)} / ${
                s.display_name
              }`,
            })),
        ];
      }, []),
    [adminSections],
  );

  const filteredAdmin = useMemo(
    () =>
      adminSectionsSearchMap.filter(x =>
        x.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, adminSectionsSearchMap],
  );

  const openNewModal = useCallback(
    (modalId: string) => {
      dispatch(closeModal());
      dispatch(setOpenModal(modalId));
    },
    [dispatch],
  );

  const contextualActions = useSelector(getContextualPaletteActions);

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
            id: "admin_settings",
            children: t`Admin settings`,
            icon: () => <Icon name="gear" />,
            closeOnSelect: false,
            onClick: () => {
              setQuery("");
              setPage("admin_settings");
            },
          },
          {
            id: "search_docs",
            children: query
              ? jt`${(
                  <span>
                    Search documentation for&nbsp;
                    <strong>&ldquo;{query}&rdquo;</strong>
                  </span>
                )}`
              : t`Metabase documentation`,
            keywords: [query], // always match the query
            icon: () => <Icon name="reference" />,
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
        ],
      },
    ];
    if (contextualActions.length) {
      actions.unshift({
        id: "contextual_actions",
        heading: "On this page",
        items: contextualActions,
      });
    }
    return actions;
  }, [query, dispatch, setPage, openNewModal, setQuery, contextualActions]);

  const adminSettingsActions = [
    {
      id: "admin_settings",
      heading: "Admin settings",
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
        ...filteredAdmin.map(s => ({
          id: s.displayName,
          children: s.displayName,
          icon: () => <Icon name="gear" />,
          onClick: () =>
            dispatch(
              push({
                pathname: s.path,
                hash: `#${s.key}`,
              }),
            ),
        })),
      ],
    },
  ];

  return {
    defaultActions: filterItems(defaultActions, query),
    adminSettingsActions: adminSettingsActions,
  };
};
