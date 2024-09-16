import { useEffect, useRef, type FC, type ReactNode } from "react";

import {
  ContainerPadding,
  DashboardHeader,
  Divider,
  ExportContainerWrapper,
} from "./ExportContainer.styled";

type ExportContainerProps = {
  children?: ReactNode;
  format?: "a4" | "a3";
  orientation?: "p" | "l";
  title: string;
  onChangePageLayout?: (hiddenMeta: PrintPageMeta) => void;
  pageIndex: number;
  printPagesMeta: PrintPageMeta;
};

export type PrintPageMeta = (string | null)[][];

export const EXPORT_NODE_ID = "customExportNode";

const ExportContainer: FC<ExportContainerProps> = ({
  children,
  format = "a3",
  orientation = "l",
  title,
  onChangePageLayout,
  printPagesMeta,
  pageIndex,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const containerPosition = ref.current?.getBoundingClientRect();
    const containerBottomLine = containerPosition?.bottom;

    const containerHeight = containerPosition?.height;
    if (containerBottomLine && containerHeight) {
      const isLastPage = printPagesMeta.length === pageIndex + 1;
      if (isLastPage) {
        setTimeout(() => {
          const chartNodes = ref.current?.querySelectorAll<HTMLElement>(
            "div[data-testid=dashcard-container]",
          );
          const pageCharts = printPagesMeta[pageIndex];
          const initialHiddenMeta = printPagesMeta.filter(
            (_, index) => index !== pageIndex,
          );
          let nextPageIndex = pageIndex + 1;
          const updatedPagesMeta = [
            ...(chartNodes ?? []),
          ].reduce<PrintPageMeta>((acc, chartNode) => {
            const chartId =
              chartNode.children[0].getAttribute("data-dashcard-key");
            const chartPosition = chartNode.getBoundingClientRect();
            const chartHeight = chartPosition.height;
            const chartIsBigger = chartHeight >= containerHeight;
            const chartBottomLine = chartPosition.bottom;
            const isHidden = chartBottomLine > containerBottomLine;

            if (pageCharts.includes(chartId)) {
              if (chartIsBigger) {
                const lastCharts = [...(acc?.[nextPageIndex] ?? [])];
                if (lastCharts.length) {
                  acc[nextPageIndex + 1] = [chartId];
                } else {
                  acc[nextPageIndex] = [chartId];
                  nextPageIndex += 1;
                  acc[nextPageIndex] = lastCharts;
                }
              } else {
                if (isHidden) {
                  acc[nextPageIndex] = [
                    ...(acc?.[nextPageIndex] ?? []),
                    chartId,
                  ];
                } else {
                  acc[pageIndex] = [...(acc?.[pageIndex] ?? []), chartId];
                }
              }
            }
            return acc;
          }, initialHiddenMeta);
          if (updatedPagesMeta?.[nextPageIndex]?.length) {
            onChangePageLayout?.(updatedPagesMeta);
          }
        }, 300);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current?.clientHeight]);

  return (
    <>
      <ContainerPadding
        format={format}
        orientation={orientation}
        id={EXPORT_NODE_ID}
      >
        <ExportContainerWrapper ref={ref}>
          <DashboardHeader>{title}</DashboardHeader>
          {children}
        </ExportContainerWrapper>
      </ContainerPadding>
      <Divider />
    </>
  );
};

export { ExportContainer };
