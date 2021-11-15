import styled from "styled-components";
import { color } from "metabase/lib/colors";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const SnackbarRoot = styled.div`
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  width: 16rem;
  border-radius: 6px;
  background-color: ${color("white")};
  box-shadow: 0 1px 12px ${color("shadow")};
  overflow: hidden;
`;

export const SnackbarHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 0.625rem 1rem;
  background-color: ${color("brand")};
`;

export const SnackbarTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("bg-light")};
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
`;

export const SnackbarToggle = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  color: ${color("white")};
`;

export const SnackbarContent = styled.div`
  background-color: ${color("white")};
`;

export const DatabaseCard = styled.div`
  display: flex;
  align-items: center;
  margin: 0.75rem;
`;

export const DatabaseContent = styled.div`
  flex: 1 1 auto;
  margin: 0 0.75rem;
  overflow: hidden;
`;

export const DatabaseIcon = styled.div`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 1rem;
  color: ${color("brand")};
  background-color: ${color("brand-light")};
`;

export const DatabaseTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
  overflow: hidden;
`;

export const DatabaseDescription = styled.div`
  color: ${color("bg-dark")};
  font-size: 0.6875rem;
  font-weight: bold;
  line-height: 0.8125rem;
  margin-top: 0.25rem;
`;

export const DatabaseSpinner = styled(LoadingSpinner)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${color("brand")};
`;

export const DatabaseIconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 1rem;
  color: ${color("white")};
  background-color: ${color("accent1")};
`;
