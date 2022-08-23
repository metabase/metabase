export const a = 123;
// import _ from "underscore";

// import { QuestionUpdateFn } from "metabase-lib/lib/Question";
// import Metadata from "metabase-lib/lib/metadata/Metadata";
// import { Card } from "metabase-types/types/Card";
// import { Dataset, Value } from "metabase-types/types/Dataset";
// import { Metric } from "metabase-types/api/newmetric";
// import NewMetrics from "metabase/entities/new-metrics";
// import { NewMetricApi } from "metabase/services";
// import Question from "metabase-lib/lib/Question";

// export default class MetricQuestion extends Question {
//   // metric: Metric;
//   // constructor({
//   //   card,
//   //   metadata,
//   //   metric,
//   //   update,
//   // }: {
//   //   card: Card;
//   //   metadata: Metadata;
//   //   metric: Metric;
//   //   update?: QuestionUpdateFn | null | undefined;
//   // }) {
//   //   super(card, metadata, undefined, update);
//   //   this.metric = metric;
//   // }
//   // clone(): MetricQuestion {
//   //   return new MetricQuestion({
//   //     card: this.card(),
//   //     metadata: this.metadata(),
//   //     metric: this.metric,
//   //   });
//   // }
//   // setCard(card: Card): MetricQuestion {
//   //   return this.setCard(card) as MetricQuestion;
//   // }
//   // // equality is driven by the state of the `metric`, not the `card`
//   // // because the `card` state is determined by the `metric`
//   // isEqual(other: MetricQuestion, { compareResultsMetadata = true } = {}) {
//   //   // const areQuestionsEqual = super.isEqual(other, { compareResultsMetadata });
//   //   // if (!areQuestionsEqual) {
//   //   //   return false;
//   //   // }
//   //   const metric = this.metric;
//   //   const otherMetric = other.metric;
//   //   // `metric` does not currently have result_metadata,
//   //   // but I am mimicking the Question interface here
//   //   const areMetricsEqual = compareResultsMetadata
//   //     ? _.isEqual(metric, otherMetric)
//   //     : _.isEqual(
//   //         _.omit(metric, "result_metadata"),
//   //         _.omit(otherMetric, "result_metadata"),
//   //       );
//   //   return areMetricsEqual;
//   // }
//   // isDirtyComparedTo(original: MetricQuestion): boolean {
//   //   return !this.isEqual(original);
//   // }
//   // isDirtyComparedToWithoutParameters(original: MetricQuestion): boolean {
//   //   return !this.isEqual(original);
//   // }
//   // // not used?
//   // async apiCreate() {
//   //   return this;
//   // }
//   // // not used?
//   // async apiUpdate() {
//   //   return this;
//   // }
//   // // what do here
//   // async reduxCreate() {
//   //   return this;
//   // }
//   // async reduxUpdate() {
//   //   return this;
//   // }
//   // async apiGetResults({
//   //   cancelDeferred,
//   //   isDirty = false,
//   //   ignoreCache = false,
//   //   collectionPreview = false,
//   // }: {
//   //   cancelDeferred: any;
//   //   isDirty?: boolean | undefined;
//   //   ignoreCache?: boolean | undefined;
//   //   collectionPreview?: boolean | undefined;
//   // }): Promise<[Dataset]> {
//   //   const metric = this.metric;
//   //   const { id } = metric;
//   //   const results = await NewMetricApi.query(
//   //     { id },
//   //     {
//   //       cancelled: cancelDeferred.promise,
//   //     },
//   //   );
//   //   return [results as Dataset];
//   // }
// }

// // Object.setPrototypeOf(MetricQuestion.prototype, Question.prototype);
