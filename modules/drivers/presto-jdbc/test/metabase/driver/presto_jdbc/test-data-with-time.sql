
DROP TABLE IF EXISTS "test_data"."default"."test_data_with_time_users";

CREATE TABLE "test_data"."default"."test_data_with_time_users" (
  "id" INTEGER,
  "name" VARCHAR,
  "last_login_date" DATE,
  "last_login_time" TIME,
  "password" VARCHAR
);

-- 15 rows
INSERT INTO "test_data"."default"."test_data_with_time_users" ("name", "last_login_date", "last_login_time", "password")
VALUES
('Plato Yeshua', date '2014-04-01', time '08:30:00.000', '4be68cda-6fd5-4ba7-944e-2b475600bda5'),
('Felipinho Asklepios', date '2014-12-05', time '15:15:00.000', '5bb19ad9-f3f8-421f-9750-7d398e38428d'),
('Kaneonuskatew Eiran', date '2014-11-06', time '16:15:00.000', 'a329ccfe-b99c-42eb-9c93-cb9adc3eb1ab'),
('Simcha Yan', date '2014-01-01', time '08:30:00.000', 'a61f97c6-4484-4a63-b37e-b5e58bfa2ecb'),
('Quentin Sören', date '2014-10-03', time '17:30:00.000', '10a0fea8-9bb4-48fe-a336-4d9cbbd78aa0'),
('Shad Ferdynand', date '2014-08-02', time '12:30:00.000', 'd35c9d78-f9cf-4f52-b1cc-cb9078eebdcb'),
('Conchúr Tihomir', date '2014-08-02', time '09:30:00.000', '900335ad-e03b-4259-abc7-76aac21cedca'),
('Szymon Theutrich', date '2014-02-01', time '10:15:00.000', 'd6c47a54-9d88-4c4a-8054-ace76764ed0d'),
('Nils Gotam', date '2014-04-03', time '09:30:00.000', 'b085040c-7aa4-4e96-8c8f-420b2c99c920'),
('Frans Hevel', date '2014-07-03', time '19:30:00.000', 'b7a43e91-9fb9-4fe9-ab6f-ea51ab0f94e4'),
('Spiros Teofil', date '2014-11-01', time '07:00:00.000', '62b9602c-27b8-44ea-adbd-2748f26537af'),
('Kfir Caj', date '2014-07-03', time '01:30:00.000', 'dfe21df3-f364-479d-a5e7-04bc5d85ad2b'),
('Dwight Gresham', date '2014-08-01', time '10:30:00.000', '75a1ebf1-cae7-4a50-8743-32d97500f2cf'),
('Broen Olujimi', date '2014-10-03', time '13:45:00.000', 'f9b65c74-9f91-4cfd-9248-94a53af82866'),
('Rüstem Hebel', date '2014-08-01', time '12:45:00.000', '02ad6b15-54b0-4491-bf0f-d781b0a2c4f5');

