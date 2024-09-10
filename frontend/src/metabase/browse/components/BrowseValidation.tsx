import React, { useMemo, useState, useCallback, useEffect } from "react";
import { t } from "ttag";
import cx from "classnames";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import {
  SortIcon,
  Table,
  TableContainerValidation,
  TableHeaderCellContent,
} from "metabase/visualizations/components/TableSimple/TableSimple.styled";
import { useQuestionListQuery } from "metabase/common/hooks";
import { CompanyHeader } from "./CompanySettings/CompanyHeader";
import CS from "metabase/css/core/index.css";
import { PaginationControls } from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";

export const BrowseValidation = () => {
  const { data, isLoading, error } = useQuestionListQuery();

  const [pageSize, setPageSize] = useState(10);
  const { handleNextPage, handlePreviousPage, setPage, page, resetPage } =
    usePagination();
  const [total, setTotal] = useState<number | null>(null);

  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Update total whenever data changes
  useEffect(() => {
    resetPage();
    setTotal(data?.length || 0);
  }, [data, resetPage]);

  // Memoized questions
  const questions = useMemo(
    () =>
      data?.map(item => ({
        ...item._card,
        team: item._card?.collection?.name,
        createdBy: item._card?.creator?.common_name,
        date: item._card?.created_at,
        isVerified: "No",
        isAIAnswered: "No",
      })) || [],
    [data],
  );

  // Paginate the questions
  const paginatedQuestions = useMemo(() => {
    const start = page * pageSize;
    return questions.slice(start, start + pageSize);
  }, [questions, page, pageSize]);

  // Columns definition
  const columns = useMemo(
    () => [
      { name: "name", display_name: t`Title` },
      { name: "team", display_name: t`Team` },
      { name: "createdBy", display_name: t`Created By` },
      { name: "date", display_name: t`Date` },
      { name: "isVerified", display_name: t`Verified` },
      { name: "isAIAnswered", display_name: t`AI Answered` },
      { name: "actions", display_name: t`Actions` },
    ],
    [],
  );

  // Sort the rows based on user input
  const sortedRows = useMemo(() => {
    let sortedQuestions = [...paginatedQuestions];
    if (sortColumn !== null) {
      const columnName = columns[sortColumn].name;
      sortedQuestions.sort((a: any, b: any) => {
        const aValue = a[columnName]?.toString().toLowerCase() || "";
        const bValue = b[columnName]?.toString().toLowerCase() || "";
        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortedQuestions;
  }, [paginatedQuestions, sortColumn, sortDirection, columns]);

  // Handle sorting of columns
  const handleSort = useCallback(
    (colIndex: any) => {
      if (sortColumn === colIndex) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colIndex);
        setSortDirection("asc");
      }
    },
    [sortColumn],
  );

  // Render each column header
  const renderColumnHeader = (col: any, colIndex: any) => {
    const iconName = sortDirection === "desc" ? "chevrondown" : "chevronup";
    return (
      <th key={colIndex} onClick={() => handleSort(colIndex)}>
        <TableHeaderCellContent
          isSorted={colIndex === sortColumn}
          isRightAligned={false}
        >
          <Ellipsified>{col.display_name}</Ellipsified>
          {colIndex === sortColumn && <SortIcon name={iconName} />}
        </TableHeaderCellContent>
      </th>
    );
  };

  // Render each row
  const renderRow = (question: any, rowIndex: any) => (
    <tr key={question.id}>
      <td>{question.name}</td>
      <td>{question.team}</td>
      <td>{question.createdBy}</td>
      <td>{new Date(question.date).toLocaleDateString()}</td>
      <td>{question.isVerified}</td>
      <td>{question.isAIAnswered}</td>
      <td>
        <button
          style={{
            backgroundColor: "#CFE6C9",
            borderRadius: "99px",
            color: "#29920E",
            padding: "0.25rem 0.75rem",
          }}
        >
          Open
        </button>
      </td>
    </tr>
  );

  // Handle changes in items per page
  const handleItemsPerPageChange = (newPageSize: any) => {
    setPageSize(newPageSize);
    setPage(0);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading questions</div>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "16px",
      }}
    >
      <CompanyHeader title={"Question Validation"} icon={"check"} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <TableContainerValidation
          className={cx(CS.scrollShow, CS.scrollShowHover)}
          style={{ flexGrow: 1, overflowY: "auto" }}
        >
          <Table>
            <thead>
              <tr>{columns.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{sortedRows.map(renderRow)}</tbody>
          </Table>
        </TableContainerValidation>

        <div
          className={cx(CS.flex, CS.justifyBetween, CS.my3)}
          style={{ marginTop: "auto" }}
        >
          <PaginationControls
            showTotal
            page={page}
            pageSize={pageSize}
            total={total ?? undefined}
            itemsLength={paginatedQuestions.length}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
            showItemsPerPage
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </div>
      </div>
    </div>
  );
};
