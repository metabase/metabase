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
    ItemNameCell,
    MaybeItemLink,
    Table,
    TableColumn,
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
  import { CollectionsIcon } from "./CollectionBreadcrumbsWithTooltip.styled";
  import {
    ModelCell,
    ModelNameColumn,
    ModelTableRow,
  } from "./ModelsTable.styled";
import { CubeDataItem } from "metabase-types/api";
import { CubeDialog } from "metabase/components/Cube/CubeDialog";
import { sortDefinitionData } from "./utils";
  
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
  
  export const CubeTable = ({
    cubeData,
    skeleton = false,
  }: CubeTableProps) => {
    const locale = useSelector(getLocale);
    const localeCode: string | undefined = locale?.code;
    const [selectedDefinition, setSelectedDefinition] = useState<CubeResult | null>()
  
    // for large datasets, we need to simplify the display to avoid performance issues
    const isLargeDataset = 100 > LARGE_DATASET_THRESHOLD;
  
    const [showLoadingManyRows, setShowLoadingManyRows] =
      useState(isLargeDataset);
  
    const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
      DEFAULT_SORTING_OPTIONS,
    );
  
    // const sortedModels = cubeData

    const typesWithParts = extractParts(cubeData.content as string)
    const typesWithSql = extractPartsWithSql(cubeData.content as string)

    const sortedDefinitions = sortDefinitionData(typesWithSql, sortingOptions, localeCode);

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
      <Table aria-label={skeleton ? undefined : "Table of models"}>
        <colgroup>
          {/* <col> for Name column */}
          <ModelNameColumn containerName={itemsTableContainerName}/>
  
          {/* <col> for Collection column */}
          <TableColumn {...collectionProps} width={`20%`} />
  
          {/* <col> for Description column */}
          <TableColumn {...descriptionProps} width={`${descriptionWidth}%`} />

          <TableColumn {...descriptionProps} width={`20%`} />
  
          <Columns.RightEdge.Col />
        </colgroup>
        <thead>
          <tr>
            <SortableColumnHeader
              name="title"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={handleUpdateSortOptions}
              style={{ paddingInlineStart: ".625rem" }}
              columnHeaderProps={{
                style: { paddingInlineEnd: ".5rem" },
              }}
            >
              {t`Name`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="type"
              // sortingOptions={sortingOptions}
              // onSortingOptionsChange={handleUpdateSortOptions}
              {...collectionProps}
              columnHeaderProps={{
                style: {
                  paddingInline: ".5rem",
                },
              }}
            >
              <Ellipsified>{t`Type`}</Ellipsified>
            </SortableColumnHeader>
            <SortableColumnHeader
              name="category"
              {...descriptionProps}
              columnHeaderProps={{
                style: {
                  paddingInline: ".5rem",
                },
              }}
            >
              {t`Description`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="category"
              {...descriptionProps}
              columnHeaderProps={{
                style: {
                  paddingInline: ".5rem",
                },
              }}
            >
              {t`Category`}
            </SortableColumnHeader>
            <Columns.RightEdge.Header />
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
            sortedDefinitions.map((cube: CubeResult) => (
              <TBodyRow cube={cube} key={cube.name} handleRowClick={handleRowClick} />
            ))
          )}
        </TBody>
      </Table>
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

  const TBodyRow = ({ cube,skeleton, handleRowClick }: { cube: CubeResult, skeleton?:boolean, handleRowClick:any }) => {
    return (
      <ModelTableRow
      onClick={(e: React.MouseEvent) => {
        if (skeleton) {
          return;
        }
        handleRowClick(cube)
      }}
      tabIndex={0}
      key={cube.name}
      >
        <NameCell cube={cube}>
          <EntityItem.Name name={cube.title} variant="list" />
        </NameCell> 
         <ModelCell {...collectionProps}>{cube.type}</ModelCell> 
         <ModelCell {...descriptionProps}>{cube.description}</ModelCell> 
         <ModelCell {...descriptionProps}>{cube.category}</ModelCell> 
        <Columns.RightEdge.Cell />
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
      let sql = extractSQL(innerMatch[0]);
      let primaryKey = extractPrimaryKey(innerMatch[0]);
      results.push({
        category,
        name: innerMatch[1],
        sql: sql,
        type: innerMatch[3],
        title: innerMatch[4] || '',
        description: innerMatch[5] || '',
        primaryKey: primaryKey
      });
    }
  }
  
    return results;
  };

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
  