import {
  type PropsWithChildren,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { t } from "ttag";

import EntityItem from "metabase/components/EntityItem";
import { SortableColumnHeader } from "metabase/components/ItemsTable/BaseItemsTable";
import {
  CubeTable,
  ItemNameCell,
  MaybeItemLink,
  Table,
  TableColumn,
  TableWrapper,
  TBody,
} from "metabase/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/components/ItemsTable/Columns";
import type { ResponsiveProps } from "metabase/components/ItemsTable/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import {
  Flex,
  Icon,
  type IconProps,
  type IconName,
  Skeleton,
} from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";
import { CollectionsIcon } from "metabase/browse/components/CollectionBreadcrumbsWithTooltip.styled";
import {
  ModelCell,
  ModelNameColumn,
  ModelTableRow,
} from "metabase/browse/components/ModelsTable.styled";
import { CubeDataItem } from "metabase-types/api";
import { CubeDialog } from "metabase/components/Cube/CubeDialog";
import { sortDefinitionData } from "metabase/browse/components/utils";
import { extractCubeName } from "./utils";
import { semantic } from "metabase/api/cubeApi";

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

interface TypeWithSql {
  category: 'measures' | 'dimensions';
  name: string;
  sql: string;
  type: string;
  title: string;
}

interface QueryStructure {
  measures: string[];
  dimensions: string[];
  limit: number;
  order: { [key: string]: 'asc' | 'desc' };
}


export const itemsTableContainerName = "ItemsTableContainer";

const descriptionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "sm",
  containerName: itemsTableContainerName,
};

const collectionProps: ResponsiveProps = {
  hideAtContainerBreakpoint: "xs",
  containerName: itemsTableContainerName,
};

const DEFAULT_SORTING_OPTIONS: SortingOptions = {
  sort_column: "title",
  sort_direction: SortDirection.Asc,
};

const LARGE_DATASET_THRESHOLD = 500;

export const CubePreviewTable = ({
  cubeData,
  skeleton = false,
}: CubeTableProps) => {
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  const [selectedDefinition, setSelectedDefinition] = useState<CubeResult | null>()
  const [ cubeSampleData, setCubeSampleData] = useState<any>(null)
  const [ dynamic, setDynamic] = useState<any>(null)
  

  // for large datasets, we need to simplify the display to avoid performance issues
  const isLargeDataset = 100 > LARGE_DATASET_THRESHOLD;

  const [showLoadingManyRows, setShowLoadingManyRows] =
    useState(isLargeDataset);

  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );

  const typesWithSql = extractPartsWithSql(cubeData.content as string)

  const cubeTable = extractCubeName(cubeData.content)
  console.log('cubeTable',cubeTable)

  function generateDynamicQuery(typesWithSql: TypeWithSql[]): QueryStructure {
    const query: QueryStructure = {
      measures: [],
      dimensions: [],
      limit: 10,
      order: {}
    };
  
    typesWithSql.forEach(item => {
      const { category, name} = item;
      if (category === 'measures') {
          query.measures.push(`${cubeTable}.${name}`);
      } else if (category === 'dimensions') {
          query.dimensions.push(`${cubeTable}.${name}`);
      }
    });
    setDynamic(query)
    return query;
  }

  useEffect(() => {
    generateDynamicQuery(typesWithSql as TypeWithSql[])
  },[])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sampleData = await getSample(dynamic);
        setCubeSampleData(sampleData.data);
      } catch (error) {
        console.error('Error fetching sample data:', error);
      }
    };

    if(dynamic !== null) {
      console.log('query',dynamic)
      fetchData();
    }
  }, [dynamic]); 

  const getSample = async ( query: any) => {
    try {
      const projectName = process.env.COMPANY_NAME
      // const resultSet = await getCubejsData({ projectName, query }).unwrap();
      const CUBEJS_TOKEN = process.env.CUBEJS_TOKEN

      const response = await fetch(`${semantic}/api/executeQuery`, {
        method: 'POST',
        headers: {
            'Authorization': `CUBEJS-TOKEN ${CUBEJS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectName, query })
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('executeQuery: Error fetching data from Cube.js API:', errorData);
    }

    const data = await response.json();
      return data
    } catch (error) {
      console.error('Error executing CubeQuery:', error);
      throw error;
    }
  };

  const sortedDefinitions = sortDefinitionData(typesWithSql, sortingOptions, localeCode);

  const sortedTypesWithSql = typesWithSql.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });
  

  /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
  const collectionWidth = 20;
  const descriptionWidth = 100 - collectionWidth;

  const handleRowClick = (cube: CubeResult) => {
    setSelectedDefinition(cube);
  };

  const handleCloseModal = () => {
    setSelectedDefinition(null);
  };

  const handleUpdateSortOptions = skeleton
    ? undefined
    : (newSortingOptions: SortingOptions) => {
        if (isLargeDataset) {
          setShowLoadingManyRows(true);
        }
        setSortingOptions(newSortingOptions);
      };

  useEffect(() => {
    // we need a better virtualized table solution for large datasets
    // for now, we show loading text to make this component feel more responsive
    if (isLargeDataset && showLoadingManyRows) {
      setTimeout(() => setShowLoadingManyRows(false), 10);
    }
  }, [isLargeDataset, showLoadingManyRows, sortedDefinitions]);

  return (
    <>
    <TableWrapper>
    <CubeTable aria-label={skeleton ? undefined : "Table of models"} isInDragLayer={false}>
    <colgroup>
        {sortedTypesWithSql.map((type) => (
          <TableColumn width={"80px"}/>
          ))}
      </colgroup>
        <thead >
          <tr>
      {sortedTypesWithSql.map((type) => (
          <SortableColumnHeader  key={type.name} {...collectionProps} columnHeaderProps={{
            style: {
              paddingInline: ".5rem",
              width: "80px"
            },
          }}>
            {type.name}
          </SortableColumnHeader>
          ))}
          </tr> 
    </thead>
      <TBody>
        {showLoadingManyRows ? (
          <TableLoader />
        ) : skeleton ? (
          <Repeat times={7}>
            <TBodyRowSkeleton />
          </Repeat>
        ) : 
        (
          <>
          {cubeSampleData && Array.isArray(cubeSampleData) ? (
            cubeSampleData.map((cube: any, index: number) => (
              <TBodyRow cube={cube} key={index} />
            ))
          ) : (
            <TableLoader />
          )}
          </>
        )}
      </TBody>
    </CubeTable>
    </TableWrapper>
    {selectedDefinition && (
      <CubeDialog
        isOpen={!!selectedDefinition}
        onClose={handleCloseModal}
        cube={selectedDefinition}
      />
    )}
    </>
  );
};

const TBodyRow = ({ cube,skeleton }: { cube: Record<string, any>, skeleton?:boolean }) => {
  const sortedKeys = Object.keys(cube).sort((a, b) => {
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (isNaN(aNum) || isNaN(bNum)) {
      return a.localeCompare(b);
    }
    return aNum - bNum;
  });
  
  const sortedValues = sortedKeys.map(key => cube[key]);
  return (
    <ModelTableRow
    onClick={(e: React.MouseEvent) => {
      if (skeleton) {
        return;
      }
    }}
    tabIndex={0}
    >
      {sortedValues.map((value, index) => (
<ModelCell key={index}>
  {value}
</ModelCell>
))}
    </ModelTableRow>
  );
};

const NameCell = ({
  cube,
  testIdPrefix = "table",
  icon,
}: PropsWithChildren<{
  cube?: CubeResult;
  testIdPrefix?: string;
  icon?: IconProps;
}>) => {
  const headingId = `model-${cube?.name || "dummy"}-heading`;
  return (
    <ItemNameCell
      data-testid={`${testIdPrefix}-name`}
      aria-labelledby={headingId}
    >
      <MaybeItemLink
        style={{
          // To align the icons with "Name" in the <th>
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
      >
        {icon && (
        <Icon
          size={16}
          {...icon}
          color={color("brand")}
          style={{ flexShrink: 0 }}
        />
        )}
        <CollectionsIcon name="folder" />
          <EntityItem.Name
            name={cube?.title || ""}
            variant="list"
            id={headingId}
          />
      </MaybeItemLink>
    </ItemNameCell>
  );
};

const TableLoader = () => (
  <tr>
    <td colSpan={4}>
      <Flex justify="center" color="text-light">
        {t`Loading…`}
      </Flex>
    </td>
  </tr>
);

const CellTextSkeleton = () => {
  return <Skeleton natural h="16.8px" />;
};

export const extractParts = (inputString: string) => {
  const regex = /(measures|dimensions):\s*{(?:[^}]*?(\w+):\s*{[^}]*?type:\s*`(\w+)`[^}]*?(?:title:\s*`([^`]+)`)?[^}]*?(?:description:\s*`([^`]+)`)?[^}]*?})+/g;
const results = [];
let match;

while ((match = regex.exec(inputString)) !== null) {
  const category = match[1];
  const innerMatches = match[0].matchAll(/(\w+):\s*{[^}]*?type:\s*`(\w+)`(?:[^}]*?title:\s*`([^`]+)`)?(?:[^}]*?description:\s*`([^`]+)`)?[^}]*?}/g);
  for (const innerMatch of innerMatches) {
    results.push({
      category,
      name: innerMatch[1],
      type: innerMatch[2],
      title: innerMatch[3] ,
      description: innerMatch[4]
    });
  }
}

return results;
};

export const extractPartsWithSql = (inputString: string) => {
const regex = /(measures|dimensions):\s*{(?:[^}]*?(\w+):\s*{[^}]*?(?:sql:\s*`([^`]+)`)?[^}]*?type:\s*`(\w+)`[^}]*?(?:title:\s*`([^`]+)`)?[^}]*?(?:description:\s*`([^`]+)`)?[^}]*?})+/g;
const results = [];
let match;

while ((match = regex.exec(inputString)) !== null) {
  const category = match[1];
  const innerMatches = match[0].matchAll(/(\w+):\s*{[^}]*?(?:sql:\s*`([^`]+)`)?[^}]*?type:\s*`(\w+)`(?:[^}]*?title:\s*`([^`]+)`)?(?:[^}]*?description:\s*`([^`]+)`)?(?:[^}]*?primaryKey:\s*(true|false))?[^}]*?}/g);
  for (const innerMatch of innerMatches) {
    const name = extractNamesFromString(innerMatch[0]);
    let sql = extractSQL(innerMatch[0]);
    let primaryKey = extractPrimaryKey(innerMatch[0]);
    results.push({
      category,
      name: name,
      sql: sql,
      type: innerMatch[3],
      title: innerMatch[4] || '',
      description: innerMatch[5] || '',
      primaryKey: primaryKey,
      recovery: match[2] || ''
    });
  }
}

  return results;
};

function extractNamesFromString(dimensionsString:string) {
  const regex = /(\w+):\s*\{/g;
  let value = '';
  let match;

  // Find all matches in the string
  while ((match = regex.exec(dimensionsString)) !== null) {
    if (match[1] !== "measures" && match[1] !== "dimensions") {
      value = match[1]
    } 
  }
  return value
}

function extractSQL(matchString:string) {
  const sqlRegex = /sql:\s*`([^`]*)`/;
  const match = matchString.match(sqlRegex);
  return match ? match[1] : '';
}

function extractPrimaryKey(matchString: string): boolean {
  const primaryKeyRegex = /primaryKey:\s*(true|false)/;
  const match = matchString.match(primaryKeyRegex);
  return match ? match[1] === 'true' : false;
}

const TBodyRowSkeleton = ({ style }: { style?: CSSProperties }) => {
  const icon = { name: "model" as IconName };
  return (
    <ModelTableRow skeleton style={style}>
      {/* Name */}
      <NameCell icon={icon}>
        <CellTextSkeleton />
      </NameCell>

      {/* Collection */}
      <ModelCell {...collectionProps}>
        <Flex>
          <CollectionsIcon name="folder" />
          <CellTextSkeleton />
        </Flex>
      </ModelCell>

      {/* Description */}
      <ModelCell {...descriptionProps}>
        <CellTextSkeleton />
      </ModelCell>

      {/* Adds a border-radius to the table */}
      <Columns.RightEdge.Cell />
    </ModelTableRow>
  );
};
