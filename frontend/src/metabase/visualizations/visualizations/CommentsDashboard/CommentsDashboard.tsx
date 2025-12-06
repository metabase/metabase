import React, { useState, useMemo, useEffect } from "react";
import { t } from "ttag";
import _ from "underscore";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { useMounted } from "metabase/hooks/use-mounted";
import { Icon } from "metabase/ui";
import { formatDateTime } from "metabase/lib/formatting";
import { VisualizationSettings } from "metabase-types/api";
import { VisualizationProps } from "metabase/visualizations/types";
import {
  Root,
  Header,
  Title,
  Controls,
  SearchInput,
  FilterSelect,
  SortSelect,
  TableContainer,
  Table,
  TableHeader,
  TableRow,
  TableCell,
  CommentRow,
  CommentHeader,
  CommentContent,
  CommentText,
  CommentMeta,
  CommentActions,
  ExpandButton,
  StatsContainer,
  StatCard,
  StatValue,
  StatLabel,
  Pagination,
  PageButton,
  EmptyState,
  LoadingState,
  ErrorState,
} from "./CommentsDashboard.styled";

interface Comment {
  id: string;
  topic: string;
  date: string;
  author: string;
  text: string;
  address: string;
  has_response: boolean;
  district: string;
  settlement: string;
  text_preview?: string;
}

interface CommentsDashboardProps extends VisualizationProps {
  data: {
    rows: Comment[];
    cols: any[];
  };
  settings: VisualizationSettings;
}

const ITEMS_PER_PAGE = 20;

export const CommentsDashboard = ({
  data,
  settings,
  onVisualizationClick,
}: CommentsDashboardProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "topic" | "author">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const isMounted = useMounted();

  // Extract unique values for filters
  const { topics, authors, districts } = useMemo(() => {
    if (!data?.rows) {
      return { topics: [], authors: [], districts: [] };
    }

    const topicsSet = new Set<string>();
    const authorsSet = new Set<string>();
    const districtsSet = new Set<string>();

    data.rows.forEach((comment: Comment) => {
      if (comment.topic) topicsSet.add(comment.topic);
      if (comment.author) authorsSet.add(comment.author);
      if (comment.district) districtsSet.add(comment.district);
    });

    return {
      topics: Array.from(topicsSet).sort(),
      authors: Array.from(authorsSet).sort(),
      districts: Array.from(districtsSet).sort(),
    };
  }, [data?.rows]);

  // Filter and sort comments
  const filteredComments = useMemo(() => {
    if (!data?.rows) return [];

    let filtered = data.rows.filter((comment: Comment) => {
      const matchesSearch =
        !debouncedSearchTerm ||
        comment.topic?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        comment.author?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        comment.text?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        comment.address?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

      const matchesTopic = !selectedTopic || comment.topic === selectedTopic;
      const matchesAuthor = !selectedAuthor || comment.author === selectedAuthor;
      const matchesDistrict = !selectedDistrict || comment.district === selectedDistrict;

      return matchesSearch && matchesTopic && matchesAuthor && matchesDistrict;
    });

    // Sort
    filtered.sort((a: Comment, b: Comment) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case "date":
          aValue = new Date(a.date).getTime();
          bValue = new Date(b.date).getTime();
          break;
        case "topic":
          aValue = a.topic?.toLowerCase() || "";
          bValue = b.topic?.toLowerCase() || "";
          break;
        case "author":
          aValue = a.author?.toLowerCase() || "";
          bValue = b.author?.toLowerCase() || "";
          break;
        default:
          return 0;
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [
    data?.rows,
    debouncedSearchTerm,
    selectedTopic,
    selectedAuthor,
    selectedDistrict,
    sortBy,
    sortDirection,
  ]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredComments.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedComments = filteredComments.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  // Calculate statistics
  const stats = useMemo(() => {
    if (!data?.rows) {
      return {
        total: 0,
        withResponse: 0,
        withoutResponse: 0,
        uniqueTopics: 0,
        uniqueAuthors: 0,
      };
    }

    const total = data.rows.length;
    const withResponse = data.rows.filter(c => c.has_response).length;
    const withoutResponse = total - withResponse;
    const uniqueTopics = new Set(data.rows.map(c => c.topic)).size;
    const uniqueAuthors = new Set(data.rows.map(c => c.author)).size;

    return {
      total,
      withResponse,
      withoutResponse,
      uniqueTopics,
      uniqueAuthors,
    };
  }, [data?.rows]);

  // Handle comment click
  const handleCommentClick = (comment: Comment) => {
    if (onVisualizationClick) {
      onVisualizationClick({
        data: [{ value: comment.id }],
        element: { rowIndex: 0, colIndex: 0 },
        settings,
      });
    }
  };

  // Toggle comment expansion
  const toggleCommentExpansion = (commentId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  // Reset filters
  const resetFilters = () => {
    setSearchTerm("");
    setSelectedTopic(null);
    setSelectedAuthor(null);
    setSelectedDistrict(null);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <LoadingState>
        <Icon name="hourglass" size={32} />
        <div>{t`Загрузка комментариев...`}</div>
      </LoadingState>
    );
  }

  if (error) {
    return (
      <ErrorState>
        <Icon name="warning" size={32} />
        <div>{error}</div>
        <button onClick={() => setError(null)}>{t`Повторить`}</button>
      </ErrorState>
    );
  }

  if (!data?.rows?.length) {
    return (
      <EmptyState>
        <Icon name="inbox" size={32} />
        <div>{t`Нет данных для отображения`}</div>
      </EmptyState>
    );
  }

  return (
    <Root>
      <Header>
        <Title>{t`Дашборд комментариев`}</Title>
        <Controls>
          <SearchInput
            type="text"
            placeholder={t`Поиск по комментариям...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <FilterSelect
            value={selectedTopic || ""}
            onChange={e => setSelectedTopic(e.target.value || null)}
          >
            <option value="">{t`Все темы`}</option>
            {topics.map(topic => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={selectedAuthor || ""}
            onChange={e => setSelectedAuthor(e.target.value || null)}
          >
            <option value="">{t`Все авторы`}</option>
            {authors.map(author => (
              <option key={author} value={author}>
                {author}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={selectedDistrict || ""}
            onChange={e => setSelectedDistrict(e.target.value || null)}
          >
            <option value="">{t`Все районы`}</option>
            {districts.map(district => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </FilterSelect>
          <SortSelect
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="date">{t`По дате`}</option>
            <option value="topic">{t`По теме`}</option>
            <option value="author">{t`По автору`}</option>
          </SortSelect>
          <button onClick={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}>
            {sortDirection === "asc" ? t`↑` : t`↓`}
          </button>
          <button onClick={resetFilters}>{t`Сбросить`}</button>
        </Controls>
      </Header>

      <StatsContainer>
        <StatCard>
          <StatValue>{stats.total}</StatValue>
          <StatLabel>{t`Всего комментариев`}</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.withResponse}</StatValue>
          <StatLabel>{t`С ответом`}</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.withoutResponse}</StatValue>
          <StatLabel>{t`Без ответа`}</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.uniqueTopics}</StatValue>
          <StatLabel>{t`Уникальных тем`}</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{stats.uniqueAuthors}</StatValue>
          <StatLabel>{t`Уникальных авторов`}</StatLabel>
        </StatCard>
      </StatsContainer>

      <TableContainer>
        <Table>
          <thead>
            <TableRow>
              <TableHeader>{t`Тема`}</TableHeader>
              <TableHeader>{t`Дата`}</TableHeader>
              <TableHeader>{t`Автор`}</TableHeader>
              <TableHeader>{t`Адрес`}</TableHeader>
              <TableHeader>{t`Ответ`}</TableHeader>
              <TableHeader>{t`Действия`}</TableHeader>
            </TableRow>
          </thead>
          <tbody>
            {paginatedComments.map((comment: Comment) => {
              const isExpanded = expandedComments.has(comment.id);
              return (
                <React.Fragment key={comment.id}>
                  <CommentRow onClick={() => handleCommentClick(comment)}>
                    <TableCell>{comment.topic}</TableCell>
                    <TableCell>
                      {formatDateTime(new Date(comment.date), {
                        date_style: "medium",
                        time_style: "short",
                      })}
                    </TableCell>
                    <TableCell>{comment.author}</TableCell>
                    <TableCell>{comment.address}</TableCell>
                    <TableCell>
                      {comment.has_response ? (
                        <Icon name="check" color="success" />
                      ) : (
                        <Icon name="close" color="error" />
                      )}
                    </TableCell>
                    <TableCell>
                      <CommentActions>
                        <ExpandButton
                          onClick={e => {
                            e.stopPropagation();
                            toggleCommentExpansion(comment.id);
                          }}
                        >
                          {isExpanded ? t`Свернуть` : t`Подробнее`}
                        </ExpandButton>
                      </CommentActions>
                    </TableCell>
                  </CommentRow>
                  {isExpanded && (
                    <CommentRow as="tr">
                      <TableCell colSpan={6}>
                        <CommentContent>
                          <CommentHeader>
                            <strong>{t`Текст обращения:`}</strong>
                          </CommentHeader>
                          <CommentText>{comment.text}</CommentText>
                          <CommentMeta>
                            <div>
                              <strong>{t`Район:`}</strong> {comment.district}
                            </div>
                            <div>
                              <strong>{t`Населенный пункт:`}</strong>{" "}
                              {comment.settlement}
                            </div>
                          </CommentMeta>
                        </CommentContent>
                      </TableCell>
                    </CommentRow>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Pagination>
          <PageButton
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            {t`Назад`}
          </PageButton>
          <span>
            {t`Страница`} {currentPage} {t`из`} {totalPages}
          </span>
          <PageButton
            disabled={currentPage === totalPages}
            onClick={() =>
              setCurrentPage(prev => Math.min(totalPages, prev + 1))
            }
          >
            {t`Вперед`}
          </PageButton>
        </Pagination>
      )}
    </Root>
  );
};

// Required static properties for Metabase visualization
CommentsDashboard.uiName = t`Дашборд комментариев`;
CommentsDashboard.identifier = "comments_dashboard";
CommentsDashboard.iconName = "comment";
CommentsDashboard.minSize = { width: 4, height: 4 };
CommentsDashboard.defaultSize = { width: 12, height: 8 };
CommentsDashboard.hidden = false;
CommentsDashboard.disableClickBehavior = false;
CommentsDashboard.supportsSeries = false;