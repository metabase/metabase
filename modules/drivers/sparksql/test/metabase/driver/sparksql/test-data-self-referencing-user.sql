
DROP TABLE IF EXISTS ` users `

CREATE TABLE ` users ` (
  ` id ` INT,
  ` name ` STRING,
  ` last_login ` TIMESTAMP,
  ` password ` STRING,
  ` created_by ` INTEGER
)

-- 15 rows
INSERT INTO "users" ("name", "last_login", "password", "created_by")
VALUES
('Plato Yeshua', timestamp '2014-04-01 08:30:00.000', '4be68cda-6fd5-4ba7-944e-2b475600bda5', 1),
('Felipinho Asklepios', timestamp '2014-12-05 15:15:00.000', '5bb19ad9-f3f8-421f-9750-7d398e38428d', 1),
('Kaneonuskatew Eiran', timestamp '2014-11-06 16:15:00.000', 'a329ccfe-b99c-42eb-9c93-cb9adc3eb1ab', 2),
('Simcha Yan', timestamp '2014-01-01 08:30:00.000', 'a61f97c6-4484-4a63-b37e-b5e58bfa2ecb', 3),
('Quentin Sören', timestamp '2014-10-03 17:30:00.000', '10a0fea8-9bb4-48fe-a336-4d9cbbd78aa0', 4),
('Shad Ferdynand', timestamp '2014-08-02 12:30:00.000', 'd35c9d78-f9cf-4f52-b1cc-cb9078eebdcb', 5),
('Conchúr Tihomir', timestamp '2014-08-02 09:30:00.000', '900335ad-e03b-4259-abc7-76aac21cedca', 6),
('Szymon Theutrich', timestamp '2014-02-01 10:15:00.000', 'd6c47a54-9d88-4c4a-8054-ace76764ed0d', 7),
('Nils Gotam', timestamp '2014-04-03 09:30:00.000', 'b085040c-7aa4-4e96-8c8f-420b2c99c920', 8),
('Frans Hevel', timestamp '2014-07-03 19:30:00.000', 'b7a43e91-9fb9-4fe9-ab6f-ea51ab0f94e4', 9),
('Spiros Teofil', timestamp '2014-11-01 07:00:00.000', '62b9602c-27b8-44ea-adbd-2748f26537af', 10),
('Kfir Caj', timestamp '2014-07-03 01:30:00.000', 'dfe21df3-f364-479d-a5e7-04bc5d85ad2b', 11),
('Dwight Gresham', timestamp '2014-08-01 10:30:00.000', '75a1ebf1-cae7-4a50-8743-32d97500f2cf', 12),
('Broen Olujimi', timestamp '2014-10-03 13:45:00.000', 'f9b65c74-9f91-4cfd-9248-94a53af82866', 13),
('Rüstem Hebel', timestamp '2014-08-01 12:45:00.000', '02ad6b15-54b0-4491-bf0f-d781b0a2c4f5', 14);

