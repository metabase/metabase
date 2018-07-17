import React from "react";
import { Box, Flex } from "grid-styled";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import { t } from "c-3po";
import moment from "moment";

import fitViewPort from "metabase/hoc/FitViewPort";

import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import Visualization from "metabase/visualizations/components/Visualization";
import LogoIcon from "metabase/components/LogoIcon";

import colors from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";

const fullscreen = WrappedComponent =>
  class extends React.Component {
    static displayName = "FullscreenComponent";
    componentWillMount() {
      document.querySelector("body").classList.add("fullscreen");
    }
    componentWillUnmount() {
      document.querySelector("body").classList.remove("fullscreen");
    }
    render() {
      return <WrappedComponent {...this.props} />;
    }
  };

const TextSlide = ({ children }) => (
  <Box mt="auto" mb={3}>
    <SlideTitle>{children}</SlideTitle>
  </Box>
);

const SlideTitle = ({ children }) => (
  <Box is="h1" style={{ fontWeight: 900, fontSize: "3rem" }}>
    {children}
  </Box>
);

const SlideControls = ({ nextSlide, previousSlide }) => (
  <Flex
    align="center"
    className="absolute bottom right hover-child"
    p={3}
    color={colors["text-medium"]}
  >
    <Icon name="chevronleft" mx={2} onClick={previousSlide} />
    <Icon name="chevronright" onClick={nextSlide} />
  </Flex>
);

class DataSlide extends React.Component {
  render() {
    const { card } = this.props;
    return (
      <Box p={5} className="absolute top left bottom right" w="100%">
        <SlideTitle>{card.name}</SlideTitle>
        <QuestionAndResultLoader questionId={card.id}>
          {({ question, result, cancel, reload, rawSeries, loading }) => {
            if (!question) {
              return <div>"Loading..."</div>;
            }

            return rawSeries && <Visualization rawSeries={rawSeries} />;
          }}
        </QuestionAndResultLoader>
      </Box>
    );
  }
}

@connect(state => ({ user: state.currentUser }), null)
class TitleSlide extends React.Component {
  render() {
    const { children, user } = this.props;
    const presentationTime = moment().format("MM/DD/YYYY");
    return (
      <Box mt="auto">
        <Box mb={2}>
          <LogoIcon size={56} />
        </Box>
        <TextSlide>{children}</TextSlide>
        <p className="text-body">
          {t`Presented by ${user.common_name}`}
          <span className="mx1">•</span>
          {presentationTime}
        </p>
      </Box>
    );
  }
}

@entityObjectLoader({
  entityType: "dashboards",
  entityId: (state, props) => props.params.dashboardId,
  loadingAndErrorWrapper: false,
})
@fullscreen
@fitViewPort
@connect(null, { push })
class Presentation extends React.Component {
  nextSlide = () => {
    const { dashboardId, slideIndex } = this.props.params;
    this.props.push(
      Urls.presentationSlide(
        dashboardId,
        slideIndex ? parseInt(slideIndex) + 1 : 0,
      ),
    );
  };
  previousSlide = () => {
    const { dashboardId, slideIndex } = this.props.params;
    const prev = parseInt(slideIndex) - 1;
    if (prev < 0) {
      return this.props.push(Urls.presentationStart(dashboardId));
    }
    return this.props.push(
      Urls.presentationSlide(dashboardId, parseInt(slideIndex) - 1),
    );
  };
  render() {
    const { object, params } = this.props;
    if (!object) {
      return <Box>Loading...</Box>;
    }
    const currentSlide = object && object.ordered_cards[params.slideIndex];
    return (
      <Flex
        p={5}
        className="full-height relative hover-parent hover--visibility"
      >
        {params.slideIndex ? (
          currentSlide.card.name ? (
            <DataSlide card={currentSlide.card} />
          ) : (
            <TextSlide>{currentSlide.visualization_settings.text}</TextSlide>
          )
        ) : (
          <TitleSlide>{object.name}</TitleSlide>
        )}
        <SlideControls
          nextSlide={() => this.nextSlide()}
          previousSlide={() => this.previousSlide()}
        />
      </Flex>
    );
  }
}

export default Presentation;
