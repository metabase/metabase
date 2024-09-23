import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListDatabasesQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, Title, Button } from "metabase/ui";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./CompanyContainer.styled";
import { CompanyHeader } from "./CompanyHeader";
import {
  DatabaseCard,
  DatabaseCardLink,
  DatabaseGrid,
} from "./CompanyCards.styled";
import {
  EngineCardIcon,
  EngineCardImage,
  EngineCardRoot,
  EngineCardTitle,
} from "metabase/databases/components/DatabaseEngineField/DatabaseEngineWidget.styled";
import { CompanyImage } from "./CompanyImage";

export const SettingsPeople = () => {
  const dispatch = useDispatch();
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  const cards = [
    {
      id: 1,
      title: t`Databases`,
      type: "databases",
      path: "/settings/databases",
      icon: "database",
    },
    {
      id: 2,
      title: t`People`,
      type: "people",
      path: "/settings/people",
      icon: "group",
    },
    {
      id: 3,
      title: t`Permissions`,
      type: "permissions",
      path: "/settings/permissions",
      icon: "lock",
    },
  ];

  const handleCardClick = (path: string) => {
    dispatch(push(path));
  };

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!databases && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const filteredDatabases = databases?.filter(
    database => database.is_cube === false,
  );

  if (!filteredDatabases?.length) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No databases here yet`}</Box>}
        illustrationElement={
          <>
            <Box mb=".5rem">
              <img src={NoResults} />
            </Box>
            <Button
              variant="filled"
              onClick={() => {
                dispatch(push("/browse/databases/connections"));
              }}
            >
              {t`Add connection`}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <BrowseContainer>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "1rem",
          width: "100%",
          paddingRight: "2rem",
          gap: "2rem",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <CompanyHeader title={t`People`} icon={"group"} />
        </div>
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <CompanyImage />
        </div>
      </div>
      <BrowseMain style={{ marginTop: "4rem" }}>
        <BrowseSection>
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1.5rem",
              width: "100%",
            }}
          >
            {cards.map(card => {
              return (
                <EngineCardRoot
                  key={card.id}
                  onClick={() => handleCardClick(card.path)}
                  isActive={false}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <EngineCardIcon name={card.icon as any} />
                    <EngineCardTitle style={{ marginTop: 0 }}>
                      {card.title}
                    </EngineCardTitle>
                  </div>
                </EngineCardRoot>
              );
            })}
          </ul>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
