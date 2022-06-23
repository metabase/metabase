import React, { useMemo } from "react";
import { connect } from "react-redux";
import _ from "lodash";
import { getIn } from "icepick";
import { t } from "ttag";

import {
  getDashcards,
  getCardData,
  getIsLoadingComplete,
} from "metabase/dashboard/selectors";

import { CardId } from "metabase-types/types/Card";
import { DashCard, DashCardId } from "metabase-types/types/Dashboard";
import { Dataset } from "metabase-types/types/Dataset";
import { State } from "metabase-types/store";

import {
  DataAppContext,
  DataAppContextType,
  DataContextType,
} from "./DataAppContext";
import { formatDataAppString, turnRawDataIntoObjectDetail } from "./utils";

interface DataAppContextProviderOwnProps {
  children: React.ReactNode;
}

interface DataAppContextProviderStateProps {
  dashCards: Record<DashCardId, DashCard>;
  dashCardData: Record<DashCardId, Record<CardId, Dataset>>;
  isLoaded: boolean;
}

type DataAppContextProviderProps = DataAppContextProviderOwnProps &
  DataAppContextProviderStateProps;

function mapStateToProps(state: State) {
  return {
    dashCards: getDashcards(state),
    dashCardData: getCardData(state),
    isLoaded: getIsLoadingComplete(state),
  };
}

function DataAppContextProvider({
  dashCards = [],
  dashCardData = {},
  isLoaded,
  children,
}: DataAppContextProviderProps) {
  const objectDetails = useMemo(
    () =>
      Object.values(dashCards).filter(
        dashCard => dashCard.card.display === "object",
      ),
    [dashCards],
  );

  const dataContext = useMemo(() => {
    const context: DataContextType = {};

    objectDetails.forEach(dashCard => {
      const formattedCardName = _.camelCase(dashCard.card.name);
      const data = getIn(dashCardData, [dashCard.id, dashCard.card.id]);
      if (data) {
        context[formattedCardName] = turnRawDataIntoObjectDetail(data);
      }
    });

    return context;
  }, [objectDetails, dashCardData]);

  const context: DataAppContextType = useMemo(() => {
    const value: DataAppContextType = {
      data: dataContext,
      isLoaded,
      format: (text: string) => text,
    };

    value.format = (text: string) => {
      if (!isLoaded) {
        return t`Loading…`;
      }
      return formatDataAppString(text, value);
    };

    return value;
  }, [dataContext, isLoaded]);

  return (
    <DataAppContext.Provider value={context}>
      {children}
    </DataAppContext.Provider>
  );
}

export default connect<
  DataAppContextProviderStateProps,
  unknown,
  DataAppContextProviderStateProps,
  State
>(mapStateToProps)(DataAppContextProvider);
