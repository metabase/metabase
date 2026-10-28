import {
  mockCreateDashboardModal,
  mockStaticQuestion,
} from "../mock-components";

// @ts-expect-error `StaticQuestion` has no `dashboardId` prop
mockStaticQuestion(({ dashboardId }) => <p>{dashboardId}</p>);

mockCreateDashboardModal(({ onCreate }) => (
  // @ts-expect-error `onCreate` takes the created dashboard
  <button onClick={() => onCreate("Q3 revenue")}>Create</button>
));
