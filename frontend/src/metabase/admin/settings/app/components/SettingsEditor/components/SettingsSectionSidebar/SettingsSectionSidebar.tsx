import cx from "classnames";
import { Link } from "react-router";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  type AdminSettingSectionKey,
  type Sections,
  getNewVersionAvailable,
} from "metabase/admin/settings/selectors";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";

import { NewVersionIndicator } from "../../SettingsEditor.styled";

export const SettingsSectionSidebar = ({
  sections,
  activeSectionName,
}: {
  sections: Sections;
  activeSectionName: AdminSettingSectionKey;
}) => {
  const newVersionAvailable = useSelector(getNewVersionAvailable);

  const renderedSections = Object.entries(sections).map(([slug, section]) => {
    // HACK - This is used to hide specific items in the sidebar and is currently
    // only used as a way to fake the multi page auth settings pages without
    // requiring a larger refactor.
    const isNestedSettingPage = Boolean(slug.split("/")[1]);
    if (isNestedSettingPage) {
      return null;
    }

    // The nested authentication routes should be matched just on the prefix:
    // e.g. "authentication/google" => "authentication"
    const [sectionNamePrefix] = activeSectionName.split("/");

    const classes = cx(
      AdminS.AdminListItem,
      CS.flex,
      CS.alignCenter,
      CS.noDecoration,
      CS.justifyBetween,
      { [AdminS.selected]: slug === sectionNamePrefix },
    );

    // if this is the Updates section && there is a new version then lets add a little indicator
    const shouldDisplayNewVersionIndicator =
      slug === "updates" && newVersionAvailable && !MetabaseSettings.isHosted();

    const newVersionIndicator = shouldDisplayNewVersionIndicator ? (
      <NewVersionIndicator>1</NewVersionIndicator>
    ) : null;

    return (
      <li key={slug}>
        <Link
          data-testid="settings-sidebar-link"
          to={"/admin/settings/" + slug}
          className={classes}
        >
          <span>{section.name}</span>
          {newVersionIndicator}
        </Link>
      </li>
    );
  });

  return (
    <aside className={cx(AdminS.AdminList, CS.flexNoShrink)}>
      <ul className={CS.pt1} data-testid="admin-list-settings-items">
        <ErrorBoundary>{renderedSections}</ErrorBoundary>
      </ul>
    </aside>
  );
};
