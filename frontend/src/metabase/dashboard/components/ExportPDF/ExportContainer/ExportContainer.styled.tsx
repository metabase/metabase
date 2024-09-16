import styled from "@emotion/styled";

export const ContainerPadding = styled.div<{
  format?: "a4" | "a3";
  orientation: "p" | "l";
}>`
  --a4-width: 297mm;
  --a4-height: 210mm;
  --a3-width: 420mm;
  --a3-height: 297mm;

  padding: 25mm 10mm 20mm 20mm;
  background: white;
  width: ${({ format, orientation }) => {
    switch (format) {
      case "a4": {
        return orientation === "l" ? "var(--a4-width)" : "var(--a4-height)";
      }
      case "a3": {
        return orientation === "l" ? "var(--a3-width)" : "var(--a3-height)";
      }
    }
  }};
  height: ${({ format, orientation }) => {
    switch (format) {
      case "a4": {
        return orientation === "l" ? "var(--a4-height)" : "var(--a4-width)";
      }
      case "a3": {
        return orientation === "l" ? "var(--a3-height)" : "var(--a3-width)";
      }
    }
  }};
`;

export const ExportContainerWrapper = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

export const DashboardHeader = styled.h2`
  padding-bottom: 10px;
`;

export const Divider = styled.div`
  border-bottom: 1px dashed gray;
`;
