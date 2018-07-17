import React from "react";
import { Box, Flex } from "grid-styled";
import { push } from "react-router-redux";
import { connect } from "react-redux";

import fitViewPort from "metabase/hoc/FitViewPort";

import QuestionAndResultLoader from "metabase/containers/QuestionAndResultLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import Visualization from "metabase/visualizations/components/Visualization";

import colors from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import * as Urls from "metabase/lib/urls";

const fullscreen = WrappedComponent =>
  class extends React.Component {
    static displayName = "FullscreenComponent";
    componentWillMount() {
      document.querySelector("body").classList.add("fullscreen");
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

const Controls = ({ nextSlide, previousSlide }) => (
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
    console.log(card);
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
    this.props.push(
      Urls.presentationSlide(dashboardId, parseInt(slideIndex) - 1),
    );
  };
  render() {
    const { object, params } = this.props;
    if (!object) {
      return <Box>Loading...</Box>;
    }
    const currentSlide = object.ordered_cards[params.slideIndex];
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
          <TextSlide>{object.name}</TextSlide>
        )}
        <Controls
          nextSlide={() => this.nextSlide()}
          previousSlide={() => this.previousSlide()}
        />
      </Flex>
    );
  }
}

export default Presentation;
