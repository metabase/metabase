import {
    type PropsWithChildren,
    useEffect,
    useState,
    type CSSProperties,
  } from "react";
  import { t } from "ttag";

  import * as Urls from "metabase/lib/urls";
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
  import { sortCubeData } from "./utils";
import { CubeDataItem } from "metabase-types/api";
  
  export interface SemanticTableProps {
    cubeDataArray?: CubeDataItem[];
    /** True if this component is just rendering a loading skeleton */
    skeleton?: boolean;
    onRowClick: (cube: CubeDataItem) => void;
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
    sort_column: "name",
    sort_direction: SortDirection.Asc,
  };
  
  const LARGE_DATASET_THRESHOLD = 500;
  
  export const SemanticTable = ({
    cubeDataArray = [],
    skeleton = false,
    onRowClick
  }: SemanticTableProps) => {
    const locale = useSelector(getLocale);
    const localeCode: string | undefined = locale?.code;
  
    // for large datasets, we need to simplify the display to avoid performance issues
    const isLargeDataset = cubeDataArray.length > LARGE_DATASET_THRESHOLD;
  
    const [showLoadingManyRows, setShowLoadingManyRows] =
      useState(isLargeDataset);
  
    const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
      DEFAULT_SORTING_OPTIONS,
    );
  
    // const sortedModels = cubeDataArray
    const sortingCubes = (cubeArr: CubeDataItem[]) => {
      return cubeArr.map((item: CubeDataItem) => ({
        ...item, // Devolvemos el item directamente
      }));
    };
    
    const CubeDataItems = sortingCubes(cubeDataArray)

    const sortedModels = sortCubeData(CubeDataItems, sortingOptions, localeCode);
  
    /** The name column has an explicitly set width. The remaining columns divide the remaining width. This is the percentage allocated to the collection column */
    const collectionWidth = 38.5;
    const descriptionWidth = 100 - collectionWidth;
  
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
    }, [isLargeDataset, showLoadingManyRows, sortedModels]);
  
    return (
      <Table aria-label={skeleton ? undefined : "Table of models"}>
        <colgroup>
          {/* <col> for Name column */}
          <ModelNameColumn containerName={itemsTableContainerName} />
  
          {/* <col> for Collection column */}
          <TableColumn {...collectionProps} width={`${collectionWidth}%`} />
  
          {/* <col> for Description column */}
          <TableColumn {...descriptionProps} width={`${descriptionWidth}%`} />
  
          <Columns.RightEdge.Col />
        </colgroup>
        <thead>
          <tr>
            <SortableColumnHeader
              name="fileName"
              sortingOptions={sortingOptions}
              onSortingOptionsChange={handleUpdateSortOptions}
              style={{ paddingInlineStart: ".625rem" }}
              columnHeaderProps={{
                style: { paddingInlineEnd: ".5rem" },
              }}
            >
              {t`Folder`}
            </SortableColumnHeader>
            <SortableColumnHeader
              name="creation date"
              {...collectionProps}
              columnHeaderProps={{
                style: {
                  paddingInline: ".5rem",
                },
              }}
            >
              <Ellipsified>{t`Creation date`}</Ellipsified>
            </SortableColumnHeader>
            <SortableColumnHeader
              name="description"
              {...descriptionProps}
              columnHeaderProps={{
                style: {
                  paddingInline: ".5rem",
                },
              }}
            >
              {t`Description`}
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
            sortedModels.map((cube: CubeDataItem) => (
              <TBodyRow cube={cube} key={cube.name} onRowClick={onRowClick} />
            ))
          )}
        </TBody>
      </Table>
    );
  };

  const TBodyRow = ({ cube, skeleton, onRowClick }: { cube: CubeDataItem, skeleton?: boolean, onRowClick: (cube: CubeDataItem) => void }) => {
    return (
      <ModelTableRow
      onClick={(e: React.MouseEvent) => {
        if (skeleton) {
          return;
        }
        onRowClick(cube);
      }}
      tabIndex={0}
      key={cube.name}
      >
        <NameCell cube={cube}>
          <EntityItem.Name name={cube.title} variant="list" />
        </NameCell> 
        <ModelCell {...collectionProps}>25.02.2024 at 8.40am</ModelCell> 
        <ModelCell {...descriptionProps}>{cube.description}</ModelCell> 
        <Columns.RightEdge.Cell />
      </ModelTableRow>
    );
  };
  
  const NameCell = ({
    cube,
    testIdPrefix = "table",
    icon,
  }: PropsWithChildren<{
    cube?: CubeDataItem;
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
          to={cube ? Urls.browseCube({ name: cube.name }) : undefined}
          style={{
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
  