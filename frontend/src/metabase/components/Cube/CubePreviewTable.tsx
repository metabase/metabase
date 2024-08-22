import {
  useEffect,
  useState,
} from "react";
import { useDispatch } from "metabase/lib/redux";
import { CubeDataItem } from "metabase-types/api";
import { extractCubeName } from "./utils";
import { CardApi } from "metabase/services";
import { loadMetadataForCard } from "metabase/questions/actions";
import Question from "metabase-lib/v1/Question";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import LoadingSpinner from "../LoadingSpinner";
import { useListDatabasesWithTablesQuery } from "metabase/api";
import LoadingAndErrorWrapper from "../LoadingAndErrorWrapper";

export interface CubeTableProps {
  cubeData: CubeDataItem;
  skeleton?: boolean;
}

export interface CubeResult {
  category: string;
  name:string;
  type:string;
  title:string;
  sql?:string;
  primaryKey:boolean;
  description:string;
}

export const itemsTableContainerName = "ItemsTableContainer";

export const CubePreviewTable = ({
  cubeData,
  skeleton = false,
}: CubeTableProps) => {
  const [dbId, setDbId] = useState<number | null>(null)
  const [card, setCard] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [defaultQuestion, setDefaultQuestion] = useState<any>(null);
  const [codeQuery, setCodeQuery] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true)
  const { data, error } = useListDatabasesWithTablesQuery();
  const databases = data?.data;
  const dispatch = useDispatch();

  const cubeTable = extractCubeName(cubeData.content)

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  async function createCard(db:number,table:number) {
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
      const card = await CardApi.create(cardData);
      const queryCard = await CardApi.query({ cardId: card.id });

      const cardMetadata:any = await dispatch(loadMetadataForCard(card));
      const getDatasetQuery = card?.dataset_query;

      // Filtering and updating fields
      const filteredQuery = queryCard.data.cols.filter(async (item: any) => {
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

      const defaultQuestionTest = Question.create({
        databaseId: db,
        name: card.name,
        type: "query",
        display: card.display,
        visualization_settings: {},
        dataset_query: getDatasetQuery,
        metadata: cardMetadata.payload.entities
    });
      setLoading(false)
      const newQuestion = defaultQuestionTest.setCard(card);
      setResult(queryCard)
      setCodeQuery(queryCard.data.native_form.query);
      setDefaultQuestion(newQuestion);
      setCard(card);
    } catch (error) {
      console.error("Error creating card:", error);
      throw error;
    }
  }

  const tableFinder = (db:any) => {
    const table = db[0].tables.filter((item:any) => item.name === cubeTable)
    createCard(db[0].id, table[0].id)
  }
  
  
  const dbFinder = (databases:any) => {
    if(databases) {
      const filteredDb = databases.filter((db:any) => db.id === dbId);
      if (filteredDb.length > 0) {
        tableFinder(filteredDb)
      }
    }
  };
  
  useEffect(() => {
    let dbId = setCubeFromUrl()
    if(dbId !== undefined) {
      setDbId(dbId)
    }
  },[])

  useEffect(() => {
    dbFinder(databases)
  },[databases])

  const setCubeFromUrl = () => {
    const pathSegments = window.location.pathname.split('/');
    const cubesIndex = pathSegments.indexOf('cubes');
    if (cubesIndex === -1 || cubesIndex === 0) return;
    
    const slug = pathSegments[cubesIndex - 1];
  
    if (!slug) return;
      const indexOfDash = slug.indexOf('-');
      if (indexOfDash === -1) {
          return 0; 
      }
    return Number(slug.substring(0, indexOfDash))
  };

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
    { loading ? (
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
    ):(

      <>
    {card && defaultQuestion && result && (
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
         result={result}
         className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
         rawSeries={[{ card, data: result && result.data }]}
         isRunning={false}
         navigateToNewCardInsideQB={null}
         onNavigateBack={() => console.log('back')}
         timelineEvents={[]}
         selectedTimelineEventIds={[]}
     />
</div>

    )}
    </>
  )}
    </>
  );
};
