import { useRegisterActions, type Action, useKBar } from "kbar";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { useMount } from "react-use";

import { getSections } from "metabase/admin/settings/selectors";
import { initializeSettings } from "metabase/admin/settings/settings";
import { useDispatch, useSelector } from "metabase/lib/redux";

type AdminSetting = {
  key: string;
  display_name: string;
  description: string | null;
  type?: "string";
  path: string;
};

type AdminSection = {
  settings: AdminSetting[];
};

export const SettingsCommandPaletteActions = () => {
  const dispatch = useDispatch();

  useMount(() => {
    dispatch(initializeSettings());
  });

  const sections = useSelector<Record<string, AdminSection>>(state =>
    getSections(state),
  );

  const { search: query } = useKBar(state => ({ search: state.searchQuery }));
  const hasQuery = query.length > 0;

  const adminSettingsActions = useMemo(() => {
    return Object.keys(sections).reduce<Action[]>((memo, key) => {
      const settings: AdminSetting[] = sections[key].settings || [];
      const path = `/admin/settings/${key}`;
      const acc: Action[] = [
        ...memo,
        ...settings
          .filter(s => s.display_name)
          .map(s => ({
            name: s.display_name || "",
            section: "admin",
            id: `admin-setting-${s.key}`,
            perform: () => {
              dispatch(
                push({
                  pathname: path,
                  hash: `#${s.key}`,
                }),
              );
            },
            icon: "gear",
          })),
      ];
      return acc;
    }, []);
  }, [sections, dispatch]);

  useRegisterActions(hasQuery ? adminSettingsActions : [], [hasQuery]);

  return null;
};
