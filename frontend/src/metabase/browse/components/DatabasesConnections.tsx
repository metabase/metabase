import { Box, Icon, Title } from "metabase/ui";

import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { DatabaseData } from "metabase-types/api";
import { getDatabase, getDatabaseEngine } from "metabase/setup/selectors";
import {
  skipDatabase,
  submitDatabase,
  updateDatabaseEngine,
} from "metabase/setup/actions";
import { updateIn } from "icepick";
import { push } from "react-router-redux";
import { t } from "ttag";

export const DatabasesConnections = () => {
  const dispatch = useDispatch();
  const database = useSelector(getDatabase);
  const engine = useSelector(getDatabaseEngine);
  const handleEngineChange = (engine?: string) => {
    dispatch(updateDatabaseEngine(engine));
  };

  const handleDatabaseSubmit = async (database: DatabaseData) => {
    try {
      await dispatch(submitDatabase(database)).unwrap();
      dispatch(push("/browse/databases"));
    } catch (error) {
      throw getSubmitError(error);
    }
  };

  const handleStepCancel = () => {
    dispatch(skipDatabase(engine));
  };

  return (
    <>
      <Box style={{ width: "100%", padding: "2rem", textAlign: "left" }}>
        <Box
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <Icon name="lan" color="accent2" size={20} />
          <Title order={2} style={{ marginLeft: "8px" }}>
            {t`Connect with your data stack`}
          </Title>
        </Box>
        <span style={{ color: "#76797D", marginBottom: "2rem" }}>
          {t`Only grant read permissions to data sources. Not should use for answering questions.`}
        </span>
      </Box>
      <span
        style={{
          width: "100%",
          height: "auto",
          marginLeft: "auto",
          marginRight: "auto",
          paddingLeft: "2rem",
          color: "#76797D",
          fontWeight: "bolder",
          fontSize: "14px",
        }}
      >
        {t`Databases`}
      </span>
      <Box
        style={{
          display: "flex",
          gap: "1rem",
          width: "100%",
          height: "auto",
          marginLeft: "auto",
          marginRight: "auto",
          padding: "2rem",
          paddingTop: "1rem",
        }}
      >
        <DatabaseForm
          initialValues={database}
          onSubmit={handleDatabaseSubmit}
          onEngineChange={handleEngineChange}
          onCancel={handleStepCancel}
          custom={true}
        />
      </Box>
    </>
  );
};

const getSubmitError = (error: unknown): unknown => {
  return updateIn(error, ["data", "errors"], errors => ({
    details: errors,
  }));
};
