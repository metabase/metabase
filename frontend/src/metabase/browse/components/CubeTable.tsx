import {
  type PropsWithChildren,
  useEffect,
  useState,
  type CSSProperties,
  useMemo,
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
  ActionSpan,
} from "./ModelsTable.styled";
import { CubeDataItem } from "metabase-types/api";
import { CubeDialog } from "metabase/components/Cube/CubeDialog";
import { sortDefinitionData } from "./utils";
import  {parse} from "acorn";
export interface CubeTableProps {
  cubeData: CubeDataItem;
  skeleton?: boolean;
  isValidation: boolean; // Added isValidation prop
  handleSemanticView: () => void;
  onUpdateCube: (updatedCube: CubeResult) => void;
  isValidateFilter?: any;
  questionFilter?: any;
  userFilter?: any; // Add userFilter prop
  cubeRequests: any;
}

export interface CubeResult {
  category: string;
  name: string; // Updated to use 'name' instead of 'title' for the Name column
  type: string;
  title: string;
  sql?: string;
  primaryKey: boolean;
  description: string;
  verified_status?: boolean;
  in_semantic_layer?: boolean;
  user?: string;
  admin_user?: string;
  updated_at?: string;
}

export const itemsTableContainerName = "ItemsTableContainer";

type Meta = {
  verified_status: boolean;
  in_semantic_layer: boolean;
  user: string;
  admin_user: string;
  updated_at: string;
};

type Measure = {
  sql?: string;
  type: string;
  title?: string;
  description?: string;
  primaryKey?: boolean;
  meta?: Meta;
};

type Dimension = Measure;
type Joins = Measure;

type Cube = {
  title: string;
  description: string;
  sql: string;
  measures?: Record<string, Measure>;
  dimensions?: Record<string, Dimension>;
  joins?: Record<string, Joins>;
};

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
  isValidation,
  handleSemanticView,
  onUpdateCube,
  questionFilter = "", // Receive questionFilter prop
  isValidateFilter = "", // Receive isValidateFilter prop
  userFilter = "",
  cubeRequests,
}: CubeTableProps) => {
  const locale = useSelector(getLocale);
  const localeCode: string | undefined = locale?.code;
  const [selectedDefinition, setSelectedDefinition] =
    useState<CubeResult | null>();
  const [noMatched, setNoMatched] = useState<boolean>(false);
  const isLargeDataset = 100 > LARGE_DATASET_THRESHOLD;

  const [showLoadingManyRows, setShowLoadingManyRows] =
    useState(isLargeDataset);

  const [sortingOptions, setSortingOptions] = useState<SortingOptions>(
    DEFAULT_SORTING_OPTIONS,
  );
  const [typesWithSql , setTypesWithSql] = useState<CubeResult[]>([]);
  const [updatedTypesWithSql, setUpdatedTypesWithSql] = useState<CubeResult[]>([]); // Initialize with typesWithSql


  function parseCubeFile(code: string) {
    try {
      // Use acorn to parse the code
      const ast = parse(code, { ecmaVersion: 2020, sourceType: 'module' });

      // Find the cube definition (should only be 1 this may not be needed)
      ast.body.forEach((node: any) => {
        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'CallExpression' &&
          node.expression.callee.name === 'cube'
        ) {
          const cubeDefinition = node.expression.arguments[1];

          const cubeContent = astToJson(cubeDefinition);
          const result = extractPartsWithSql(cubeContent);
          setTypesWithSql(result)
          setUpdatedTypesWithSql(result);

          return result
        }
      });
    } catch (err) {
      console.error(`Error parsing code ${code}:`, err);
    }
  }

  // Helper function to convert AST nodes to JSON
  function astToJson(node: any): any {
    switch (node.type) {
      case 'ObjectExpression':
        const obj: any = {};
        node.properties.forEach((prop: any) => {
          const key: any = prop.key.name || prop.key.value;
          obj[key] = astToJson(prop.value);
        });
        return obj;
      case 'ArrayExpression':
        return node.elements.map(astToJson);
      case 'Literal':
        return node.value;
      case 'TemplateLiteral':
        if (node.expressions.length === 0) {
          // No expressions, return the cooked value as a normal string
          return node.quasis[0].value.cooked;
        } else {
          // Template literal with expressions
          return astToCode(node);
        }
      case 'Identifier':
        return node.name;
      case 'BinaryExpression':
        return astToCode(node);
      case 'CallExpression':
        return astToCode(node);
      case 'MemberExpression':
        return astToCode(node);
      case 'UnaryExpression':
        return astToCode(node);
      default:
        return null;
    }
  }

  // Helper function to convert AST expressions back to code
  function astToCode(node: any): any {
    switch (node.type) {
      case 'Identifier':
        return node.name;
      case 'Literal':
        return JSON.stringify(node.value);
      case 'TemplateLiteral':
        let str = '';
        for (let i = 0; i < node.quasis.length; i++) {
          str += node.quasis[i].value.cooked;
          if (i < node.expressions.length) {
            str += '${' + astToCode(node.expressions[i]) + '}';
          }
        }
        return '`' + str + '`';
      case 'MemberExpression':
        const object: any = astToCode(node.object);
        const property: any = node.computed
          ? `[${astToCode(node.property)}]`
          : `.${astToCode(node.property)}`;
        return `${object}${property}`;
      case 'BinaryExpression':
        return `(${astToCode(node.left)} ${node.operator} ${astToCode(node.right)})`;
      case 'CallExpression':
        return `${astToCode(node.callee)}(${node.arguments.map(astToCode).join(', ')})`;
      case 'UnaryExpression':
        return `${node.operator}${astToCode(node.argument)}`;
      case 'ArrayExpression':
        return `[${node.elements.map(astToCode).join(', ')}]`;
      case 'ObjectExpression':
        const props = node.properties.map(
          (prop: any) => `${astToCode(prop.key)}: ${astToCode(prop.value)}`
        );
        return `{${props.join(', ')}}`;
      default:
        return '';
    }
  }


  useMemo(() => {
    if (cubeData.content) {
      parseCubeFile(cubeData.content);
    }
  }, [cubeData.content]);

  
  useEffect(() => {
    let foundNoMatch = false;

    // Create a new list combining cubeRequests and typesWithSql
    const updatedData: any =
      cubeRequests && cubeRequests.length > 0
        && typesWithSql !== undefined ? 
        typesWithSql.map(typeWithSql => {
            const matchingCubeRequest = cubeRequests.find(
              (cubeRequest: any) =>
                cubeRequest.description === typeWithSql.description,
            );

            if (matchingCubeRequest) {
              // If we're not in validation mode and the verified status is false, skip this item
              if (
                !isValidation &&
                matchingCubeRequest.verified_status === false
              ) {
                return null;
              }

              return {
                ...typeWithSql,
                user: matchingCubeRequest.user || "", // Ensure default empty values
                admin_user: matchingCubeRequest.admin_user || "",
                updated_at: matchingCubeRequest.updated_at || "",
                verified_status: matchingCubeRequest.verified_status ?? false,
                in_semantic_layer:
                  matchingCubeRequest.in_semantic_layer ?? false,
              };
            }

            foundNoMatch = true; // No match found, but we return the original `typeWithSql`
            return {
              ...typeWithSql, // Return the original, but with the extra fields
              user: "",
              admin_user: "",
              updated_at: "",
              verified_status: false,
              in_semantic_layer: false,
            };
          })
          .filter(Boolean) // Remove any null entries
        : typesWithSql;
    if (cubeRequests && cubeRequests.length > 0) {
      // If a cubeRequest was not matched in `typesWithSql`, add it to the final list as "pending"
      cubeRequests.forEach((cubeRequest: any) => {
        const existingEntry = updatedData.find(
          (dataItem: any) =>
            dataItem && dataItem.description === cubeRequest.description,
        );

        // If there's no match in `typesWithSql`, and we're in validation mode or verified_status is true, add the cubeRequest to the list
        if (
          !existingEntry &&
          (isValidation || cubeRequest.verified_status === true)
        ) {
          updatedData.push({
            category: "Pending", // Optionally set this to a placeholder category
            name: cubeRequest.description,
            type: "Pending", // You can replace this based on the structure of `CubeResult`
            title: cubeRequest.description,
            description: cubeRequest.description,
            user: cubeRequest.user || "",
            admin_user: cubeRequest.admin_user || "",
            updated_at: cubeRequest.updated_at || "",
            verified_status: cubeRequest.verified_status ?? false,
            in_semantic_layer: cubeRequest.in_semantic_layer ?? false,
            primaryKey: false, // Ensure a valid structure for CubeResult
          });
        }
      });
    }
    // Only update state if the data has changed
    if (JSON.stringify(updatedTypesWithSql) !== JSON.stringify(updatedData)) {
      setUpdatedTypesWithSql(updatedData);
      setNoMatched(foundNoMatch);
    }
  }, [cubeRequests, typesWithSql, isValidation]);

  // Updated filter definitions based on `isValidation` flag and input filters
  const filteredDefinitions = updatedTypesWithSql.filter(definition => {
    // Skip filtering if cubeRequests is empty
    if (!cubeRequests || cubeRequests.length === 0 || noMatched) {
      return true; // Return all `typesWithSql` when there are no cubeRequests
    }

    const matchesQuestion = questionFilter
      ? definition.description
        .toLowerCase()
        .includes(questionFilter.toLowerCase())
      : true;

    const matchesIsValidate = isValidateFilter
      ? String(definition.verified_status) // Convert boolean to string
        .toLowerCase()
        .includes(isValidateFilter.toLowerCase()) // Use includes for partial matching
      : true;

    const matchesUser = userFilter
      ? definition.user?.toLowerCase().includes(userFilter.toLowerCase()) // Filter by user if userFilter is provided
      : true;

    // Only include items with verified_status true when isValidation is false
    const matchesVerifiedStatus =
      isValidation || definition.verified_status === true;

    return (
      matchesQuestion &&
      matchesIsValidate &&
      matchesUser &&
      matchesVerifiedStatus
    );
  });

  const sortedDefinitions = sortDefinitionData(
    filteredDefinitions,
    sortingOptions,
    localeCode,
  );
  const collectionWidth = 20;
  const descriptionWidth = 100 - collectionWidth - (isValidation ? 40 : 0); // Adjust width when validation columns are present

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
    if (isLargeDataset && showLoadingManyRows) {
      setTimeout(() => setShowLoadingManyRows(false), 10);
    }
  }, [isLargeDataset, showLoadingManyRows, sortedDefinitions]);

  return (
    <>
      <Table aria-label={skeleton ? undefined : "Table of models"}>
        <colgroup>
          {/* <col> for Name column */}
          {!isValidation && (
            <>
              <ModelNameColumn containerName={itemsTableContainerName} />
              <TableColumn {...collectionProps} width={`20%`} />
            </>
          )}
          {/* <col> for Collection column */}
          {/* <col> for Description column */}
          <TableColumn {...descriptionProps} width={`${descriptionWidth}%`} />
          <TableColumn
            {...descriptionProps}
            width={isValidation ? "10%" : "30%"}
          />
          {/* Conditionally render columns for Verified Status, In Semantic Layer, and Action */}
          {isValidation && (
            <>
              <TableColumn {...descriptionProps} width={`10%`} />{" "}
              <TableColumn {...descriptionProps} width={`15%`} />{" "}
              <TableColumn {...descriptionProps} width={`10%`} />{" "}
              <TableColumn {...descriptionProps} width={`10%`} />{" "}
              <TableColumn {...descriptionProps} width={`5%`} />{" "}
              {/* Action column */}
            </>
          )}
          <Columns.RightEdge.Col />
        </colgroup>
        <thead>
          <tr>
            {!isValidation ? (
              <>
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
              </>
            ) : (
              <>
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
                  name="user"
                  {...descriptionProps}
                  columnHeaderProps={{
                    style: {
                      paddingInline: ".5rem",
                    },
                  }}
                >
                  {t`User`}
                </SortableColumnHeader>
                <SortableColumnHeader
                  name="admin_user"
                  {...descriptionProps}
                  columnHeaderProps={{
                    style: {
                      paddingInline: ".5rem",
                    },
                  }}
                >
                  {t`Admin User`}
                </SortableColumnHeader>
                <SortableColumnHeader
                  name="updated_at"
                  {...descriptionProps}
                  columnHeaderProps={{
                    style: {
                      paddingInline: ".5rem",
                    },
                  }}
                >
                  {t`Last Update`}
                </SortableColumnHeader>
                <SortableColumnHeader
                  name="verified_status"
                  {...descriptionProps}
                  columnHeaderProps={{
                    style: {
                      paddingInline: ".5rem",
                    },
                  }}
                >
                  {t`Verified Status`}
                </SortableColumnHeader>
                <SortableColumnHeader
                  name="in_semantic_layer"
                  {...descriptionProps}
                  columnHeaderProps={{
                    style: {
                      paddingInline: ".5rem",
                    },
                  }}
                >
                  {t`In Semantic Layer`}
                </SortableColumnHeader>
                <SortableColumnHeader
                  name="action"
                  {...descriptionProps}
                  columnHeaderProps={{
                    style: {
                      paddingInline: ".5rem",
                    },
                  }}
                >
                  {t`Action`}
                </SortableColumnHeader>
              </>
            )}

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
          ) : (
            sortedDefinitions.map((cube: CubeResult) => (
              <TBodyRow
                cube={cube}
                key={cube.name}
                handleRowClick={handleRowClick}
                isValidation={isValidation} // Pass the isValidation prop to TBodyRow
              />
            ))
          )}
        </TBody>
      </Table>
      {selectedDefinition && (
        <CubeDialog
          isOpen={!!selectedDefinition}
          onClose={handleCloseModal}
          cube={selectedDefinition}
          isValidationTable={isValidation}
          handleSemanticView={handleSemanticView}
          onUpdateCube={onUpdateCube}
        />
      )}
    </>
  );
};

const TBodyRow = ({
  cube,
  skeleton,
  handleRowClick,
  isValidation, // Receive the isValidation prop
}: {
  cube: CubeResult;
  skeleton?: boolean;
  handleRowClick: any;
  isValidation: boolean; // Define isValidation prop type
}) => {
  // Determine the Action column value
  const actionValue = cube.verified_status === true ? "Done" : "Pending";
  const icon = { name: "model" as IconName }; // Define the icon for reuse

  return (
    <ModelTableRow
      onClick={(e: React.MouseEvent) => {
        if (skeleton) {
          return;
        }
        handleRowClick(cube);
      }}
      tabIndex={0}
      key={cube.name}
    >
      {!isValidation ? (
        <>
          <NameCell cube={cube}>
            <EntityItem.Name name={cube.name} variant="list" />{" "}
            {/* Updated to use 'name' */}
          </NameCell>
          <ModelCell {...collectionProps}>{cube.type}</ModelCell>
          <ModelCell {...descriptionProps}>{cube.description}</ModelCell>
          <ModelCell {...descriptionProps}>{cube.category}</ModelCell>
        </>
      ) : (
        <>
          <DescriptionCell
            cube={cube}
            isValidation={isValidation}
            icon={icon} // Pass the icon for the folder
          />
          <ModelCell {...descriptionProps}>{cube.user}</ModelCell>
          <ModelCell {...descriptionProps}>{cube.admin_user}</ModelCell>
          <ModelCell {...descriptionProps}>{cube.updated_at}</ModelCell>
          <ModelCell {...descriptionProps}>
            {cube.verified_status ? "True" : "False"}
          </ModelCell>
          <ModelCell {...descriptionProps}>
            {cube.in_semantic_layer ? "True" : "False"}
          </ModelCell>
          <ModelCell {...descriptionProps}>
            <ActionSpan isDone={actionValue === "Done"}>
              {actionValue}
            </ActionSpan>
          </ModelCell>
          {/* Action column */}
        </>
      )}

      <Columns.RightEdge.Cell />
    </ModelTableRow>
  );
};

const DescriptionCell = ({
  cube,
  isValidation,
  testIdPrefix = "table",
  icon,
}: PropsWithChildren<{
  cube?: CubeResult;
  isValidation: boolean;
  testIdPrefix?: string;
  icon?: IconProps;
}>) => {
  const headingId = `model-${cube?.name || "dummy"}-description`;

  return (
    <ItemNameCell
      data-testid={`${testIdPrefix}-description`}
      aria-labelledby={headingId}
    >
      <MaybeItemLink
        style={{
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
      >
        {isValidation && icon && (
          <Icon
            size={16}
            {...icon}
            color={color("brand")}
            style={{ flexShrink: 0 }}
          />
        )}
        <EntityItem.Name
          name={cube?.description || ""}
          variant="list"
          id={headingId}
        />
      </MaybeItemLink>
    </ItemNameCell>
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
          name={cube?.name || ""}
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
  const regex =
    /(measures|dimensions):\s*{(?:[^}]*?(\w+):\s*{[^}]*?type:\s*`(\w+)`[^}]*?(?:title:\s*`([^`]+)`)?[^}]*?(?:description:\s*`([^`]+)`)?[^}]*?})+/g;
  const results = [];
  let match;

  while ((match = regex.exec(inputString)) !== null) {
    const category = match[1];
    const innerMatches = match[0].matchAll(
      /(\w+):\s*{[^}]*?type:\s*`(\w+)`(?:[^}]*?title:\s*`([^`]+)`)?(?:[^}]*?description:\s*`([^`]+)`)?[^}]*?}/g,
    );
    for (const innerMatch of innerMatches) {
      results.push({
        category,
        name: innerMatch[1],
        type: innerMatch[2],
        title: innerMatch[3] || "",
        description: innerMatch[4] || "",
      });
    }
  }

  return results;
};

const extractPartsWithSql = (parsedData: Cube | null): CubeResult[] => {
  const results: CubeResult[] = []; // Ensure the result array is correctly typed

  if (!parsedData) {
    console.error("Parsed data is null. Cannot extract parts.");
    return results; // Return an empty array if parsedData is null
  }

  // Extract measures
  if (parsedData.measures) {
    Object.entries(parsedData.measures).forEach(([name, measure]) => {
      const typedMeasure = measure as Measure; // Explicitly type 'measure'
      results.push({
        category: "measures",
        name,
        sql: typedMeasure.sql || "", // Optional property
        type: typedMeasure.type || "",
        title: typedMeasure.title || "", // Not present in your example but added for completeness
        description: typedMeasure.description || "",
        primaryKey: extractPrimaryKey(`primaryKey: ${typedMeasure.primaryKey}`), // Default to false if not provided
      });
    });
  }

  // Extract dimensions
  if (parsedData.dimensions) {
    Object.entries(parsedData.dimensions).forEach(([name, dimension]) => {
      const typedDimension = dimension as Dimension; // Explicitly type 'dimension'
      results.push({
        category: "dimensions",
        name,
        sql: typedDimension.sql || "", // Optional property
        type: typedDimension.type || "",
        title: typedDimension.title || "", // Not present in your example but added for completeness
        description: typedDimension.description || "",
        primaryKey: extractPrimaryKey(
          `primaryKey: ${typedDimension.primaryKey}`,
        ), // Default to false if not provided
      });
    });
  }

  if (parsedData.joins) {
    Object.entries(parsedData.joins).forEach(([name, join]) => {
      const typedJoin = join as Dimension; // Explicitly type 'dimension'
      results.push({
        category: "joins",
        name,
        sql: typedJoin.sql || "", // Optional property
        type: typedJoin.type || "",
        title: typedJoin.title || "", // Not present in your example but added for completeness
        description: typedJoin.description || "",
        primaryKey: extractPrimaryKey(`primaryKey: ${typedJoin.primaryKey}`), // Default to false if not provided
      });
    });
  }

  return results;
};

function extractPrimaryKey(matchString: string): boolean {
  const primaryKeyRegex = /primaryKey:\s*(true|false)/;
  const match = matchString.match(primaryKeyRegex);
  return match ? match[1] === "true" : false;
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
