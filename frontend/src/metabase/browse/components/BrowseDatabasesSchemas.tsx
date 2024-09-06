import { t } from "ttag";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import { useListDatabaseSchemasQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { Box, Button } from "metabase/ui";
import NoResults from "assets/img/no_results.svg";
import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import {
  EngineCardIcon,
  EngineCardRoot,
  EngineCardTitle,
} from "metabase/databases/components/DatabaseEngineField/DatabaseEngineWidget.styled";
import { DatabaseGrid } from "./BrowseDatabases.styled";
import { BrowseDataHeader } from "./BrowseDataHeader";

export const BrowseDatabasesSchemas = () => {
  const dispatch = useDispatch();
  const path = window.location.pathname;
  const parts = path.split("/");
  const id = parts[3]; // Extracting database ID from the path

  const {
    data: schemaData,
    isLoading,
    error,
  } = useListDatabaseSchemasQuery({
    id: Number(id),
  });

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!schemaData?.length) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No schemas found`}</Box>}
        illustrationElement={
          <>
            <Box mb=".5rem">
              <img src={NoResults} />
            </Box>
            <Button
              variant="filled"
              onClick={() => {
                dispatch(push("/browse/databases"));
              }}
            >
              {t`Go back to databases`}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <BrowseContainer>
      {/* Header Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          width: "100%",
          paddingRight: "2rem",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <BrowseDataHeader />
        </div>
        <div style={{ display: "flex", justifyContent: "end", width: "100%" }}>
          <Button
            style={{ backgroundColor: "#223800", border: "1px solid #223800" }}
            variant="filled"
            onClick={() => {
              dispatch(push("/browse/databases"));
            }}
          >
            {t`Go back to databases`}
          </Button>
        </div>
      </div>
      <BrowseMain>
        <BrowseSection>
          <DatabaseGrid data-testid="schema-browser">
            {schemaData.map((schema: any) => (
              <div key={schema.id}>
                <EngineCardRoot
                  role="option"
                  id={`schema-option-${schema.id}`}
                  isActive={false}
                  onClick={() => {
                    dispatch(push(`/browse/databases/${id}/schema/${schema}`));
                  }}
                >
                  {/* Here, no specific logo is provided, so we use a default icon */}
                  <EngineCardIcon name="database" />
                  <EngineCardTitle>{schema.toUpperCase()}</EngineCardTitle>
                </EngineCardRoot>
              </div>
            ))}
          </DatabaseGrid>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
