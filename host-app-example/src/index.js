import * as React from "react";
import * as ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  redirect,
  RouterProvider,
} from "react-router-dom";
import "./index.css";
import { SignIn } from "./SignIn";
import App from "./App";
import { Page } from "./Page";
import { DashboardPage } from "./DashboardPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <SignIn />,
  },
  {
    path: "/app",
    element: <App />,
    children: [
      {
        index: true,
        loader: () => redirect("/app/questions"),
      },
      {
        path: "/app/questions/:questionId",
        element: <Page />,
      },
      {
        path: "/app/dashboard",
        element: <DashboardPage />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
