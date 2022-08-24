import React from "react";
import { isSyncCompleted } from "metabase/lib/syncing";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Database, PopularItem, RecentItem, User } from "metabase-types/api";
import HomePopularSection from "../../containers/HomePopularSection";
import HomeRecentSection from "../../containers/HomeRecentSection";
import HomeXraySection from "../../containers/HomeXraySection";
import { isWithinWeeks } from "../../utils";
import { t } from "ttag";
import { SettingsApi } from "metabase/services";
import { refreshCurrentUser } from "metabase/redux/user";
import { Dispatch } from "metabase-types/store";
import { color } from "metabase/lib/colors";
import Toggle from "metabase/core/components/Toggle";
import Label from "metabase/components/type/Label";

export interface HomeContentProps {
  user: User;
  databases?: Database[];
  recentItems?: RecentItem[];
  popularItems?: PopularItem[];
  dispatch: Dispatch;
}

export interface TogglePopularSectionProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

const TogglePopularSection = (props: TogglePopularSectionProps) => {
  return (
    <div className="flex justify-end w-full mt2">
      <Label>
        {props.value ? t`Hide popular items` : t`Show popular items`}
      </Label>
      <Toggle
        style={!props.value ? { backgroundColor: color("bg-dark") } : {}}
        value={props.value}
        onChange={props.onChange}
      ></Toggle>
    </div>
  );
};

const HomeContent = (props: HomeContentProps): JSX.Element => {
  const isPopularSectionEnabled =
    isPopularSection(props) &&
    props.user?.settings?.["enable-popular-items-section"] !== "false";

  const onTogglePopularSection = (value: boolean) => {
    SettingsApi.put({
      key: "enable-popular-items-section",
      value: value,
    }).then(() => {
      props.dispatch(refreshCurrentUser());
    });
  };

  if (isLoading(props)) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <>
      {isPopularSectionEnabled && <HomePopularSection />}
      {(isRecentSection(props) && !isPopularSectionEnabled && (
        <HomeRecentSection />
      )) ||
        (isXraySection(props) && !isPopularSectionEnabled && (
          <HomeXraySection />
        ))}
      {isPopularSection(props) && (
        <TogglePopularSection
          value={isPopularSectionEnabled}
          onChange={onTogglePopularSection}
        />
      )}
    </>
  );
};

const isLoading = ({
  user,
  databases,
  recentItems,
  popularItems,
}: HomeContentProps): boolean => {
  if (!user.has_question_and_dashboard) {
    return databases == null;
  } else if (user.is_installer || !isWithinWeeks(user.first_login, 1)) {
    return databases == null || recentItems == null;
  } else {
    return databases == null || recentItems == null || popularItems == null;
  }
};

const isPopularSection = ({
  user,
  recentItems = [],
  popularItems = [],
}: HomeContentProps): boolean => {
  return (
    !user.is_installer &&
    user.has_question_and_dashboard &&
    popularItems.length > 0 &&
    (isWithinWeeks(user.first_login, 1) || !recentItems.length)
  );
};

const isRecentSection = ({
  user,
  recentItems = [],
}: HomeContentProps): boolean => {
  return user.has_question_and_dashboard && recentItems.length > 0;
};

const isXraySection = ({ databases = [] }: HomeContentProps): boolean => {
  return databases.some(isSyncCompleted);
};

export default HomeContent;
