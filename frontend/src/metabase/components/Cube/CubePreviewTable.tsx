import {
  useEffect,
  useState,
} from "react";
import { CubeDataItem, StructuredDatasetQuery } from "metabase-types/api";
import Question from "metabase-lib/v1/Question";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import LoadingSpinner from "../LoadingSpinner";
import { useGetDatasetQuery, useListDatabasesWithTablesQuery } from "metabase/api";
import { skipToken } from '@reduxjs/toolkit/query';

export interface CubeTableProps {
  cubeData: CubeDataItem;
  skeleton?: boolean;
  dbId: number
}

export interface CubeResult {
  category: string;
  name: string;
  type: string;
  title: string;
  sql?: string;
  primaryKey: boolean;
  description: string;
}

export const itemsTableContainerName = "ItemsTableContainer";

export const CubePreviewTable = ({
  cubeData,
  skeleton = false,
  dbId
}: CubeTableProps) => {
  const [card, setCard] = useState<any>(null);
  const [defaultQuestion, setDefaultQuestion] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true)
  const { data, error } = useListDatabasesWithTablesQuery();
  const databases = data?.data;

  const cubeTable = cubeData.name

  const [question, setQuestion] = useState<StructuredDatasetQuery | typeof skipToken>(skipToken);

  useEffect(() => {
    if (databases) {
      const filteredDatabase = databases.find(db => db.id === dbId);
      if (filteredDatabase && filteredDatabase.tables) {
        const filteredTable = filteredDatabase.tables.find(table => table.name === cubeTable);
        if (filteredTable) {
          const questionData: StructuredDatasetQuery = {
            database: filteredDatabase.id,
            type: "query",
            query: {
              "source-table": filteredTable.id,
              limit: 50
            },
          };
          setQuestion(questionData);
          createCard(filteredDatabase.id, filteredTable.id as number)
        }
      }
    }
  }, [databases]);

  const { data: queryData } = useGetDatasetQuery(question);


  async function createCard(db: number, table: number) {
    try {
      const cardData = {
        dataset_query: {
          database: db,
          type: "query",
          query: {
            "source-table": table
          }
        },
        display: "table",
        visualization_settings: {},
        type: "question",
        name: `${db}-test`
      };

      // Filtering and updating fields
      if (queryData && queryData.data) {
        const filteredQuery = queryData.data.cols.filter(async (item: any) => {
          const shouldFilter = !Object.values(item).some(value =>
            typeof value === 'string' && (value.includes("__cubeJoinField") || value.includes("__user"))
          );

          if (!shouldFilter) {
            const id = item.id; // Replace with how you get the ID from the item
            const newVisibilityType: 'sensitive' = 'sensitive'; // Set visibility to sensitive

            await updateFieldVisibility(id, newVisibilityType);
          }

          return shouldFilter;
        })
      }

      const defaultQuestionTest = Question.create({
        databaseId: db,
        name: `${db}-test`,
        type: "query",
        display: "table",
        visualization_settings: {}
      });
      setLoading(false)
      setDefaultQuestion(defaultQuestionTest);
      setCard(cardData);
    } catch (error) {
      console.error("Error creating card:", error);
      throw error;
    }
  }

  // Function to update the visibility type of a field using fetch
  async function updateFieldVisibility(id: string, visibilityType: 'retired' | 'sensitive' | 'normal' | 'hidden' | 'details-only') {
    try {
      const response = await fetch(`/api/field/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          visibility_type: visibilityType
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update field: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  }

  return (
    <>
      {card && defaultQuestion && queryData ? (
        <div
          style={{
            padding: "16px",
            overflow: "hidden",
            height: "600px",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <VisualizationResult
            question={defaultQuestion}
            isDirty={false}
            queryBuilderMode={"view"}
            result={queryData}
            className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
            rawSeries={[{ card, data: queryData && queryData.data }]}
            isRunning={false}
            navigateToNewCardInsideQB={null}
            onNavigateBack={() => console.log('back')}
            timelineEvents={[]}
            selectedTimelineEventIds={[]}
          />
        </div>

      ) : (
        <div
          style={{
            padding: "16px",
            overflow: "hidden",
            height: "600px",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <LoadingSpinner />
        </div>
      )}
    </>
  );
};
