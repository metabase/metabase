# Visual Regression Tests

We use [Percy](https://percy.io/) via Github actions to run visual regression tests.

Visual regression tests should live inside the `frontend/test/metabase-visual` directory.

## How to trigger tests in CI

#### 1. Engineer wants to run Percy tests on a PR and posts a comment `@metabase-bot run visual tests`
<img width="937" alt="Screen Shot 2021-07-23 at 15 35 53" src="https://user-images.githubusercontent.com/14301985/126784124-b6753632-2735-496c-b80b-29521e0b9d15.png">

It triggers a workflow that is visible in the repo Actions tab
<img width="1416" alt="Screen Shot 2021-07-23 at 15 39 21" src="https://user-images.githubusercontent.com/14301985/126784265-8137570f-0f68-4064-ab77-c4455a6ad706.png">

#### 2. When there are some visual changes it shows a failed Percy check in the PR
<img width="926" alt="Screen Shot 2021-07-23 at 17 20 26" src="https://user-images.githubusercontent.com/14301985/126795943-50ebbe5e-ed36-48fe-ab69-642555a1bc1d.png">

#### 3. Once an engineer reviews and approves the changes the PR check becomes green
<img width="960" alt="Screen Shot 2021-07-23 at 17 20 45" src="https://user-images.githubusercontent.com/14301985/126796075-31d5ed5d-6926-4e98-99d2-4aef20738b56.png">

<img width="932" alt="Screen Shot 2021-07-23 at 17 21 05" src="https://user-images.githubusercontent.com/14301985/126796104-c533bbea-006c-47ef-83fa-0c07fcf5393b.png">

