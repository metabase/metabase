
IF object_id('test-data-self-referencing-user.dbo.users') IS NOT NULL DROP TABLE "test-data-self-referencing-user".dbo."users";

CREATE TABLE "test-data-self-referencing-user"."dbo"."users" (
  "id" INT IDENTITY(1, 1),
  "name" VARCHAR(1024),
  "last_login" DATETIME,
  "password" VARCHAR(1024),
  "created_by" INTEGER,
  PRIMARY KEY ("id")
);

ALTER TABLE
  "test-data-self-referencing-user"."dbo"."users"
ADD
  CONSTRAINT "ers_created_by_users_406217275" FOREIGN KEY ("created_by") REFERENCES "test-data-self-referencing-user"."dbo"."users" ("id");

-- 15 rows
INSERT INTO "test-data-self-referencing-user"."dbo"."users" ("name", "last_login", "password", "created_by")
VALUES
('Plato Yeshua', DateTime2FromParts(2014, 4, 1, 8, 30, 0, 0, 7), '4be68cda-6fd5-4ba7-944e-2b475600bda5', 1),
('Felipinho Asklepios', DateTime2FromParts(2014, 12, 5, 15, 15, 0, 0, 7), '5bb19ad9-f3f8-421f-9750-7d398e38428d', 1),
('Kaneonuskatew Eiran', DateTime2FromParts(2014, 11, 6, 16, 15, 0, 0, 7), 'a329ccfe-b99c-42eb-9c93-cb9adc3eb1ab', 2),
('Simcha Yan', DateTime2FromParts(2014, 1, 1, 8, 30, 0, 0, 7), 'a61f97c6-4484-4a63-b37e-b5e58bfa2ecb', 3),
('Quentin Sören', DateTime2FromParts(2014, 10, 3, 17, 30, 0, 0, 7), '10a0fea8-9bb4-48fe-a336-4d9cbbd78aa0', 4),
('Shad Ferdynand', DateTime2FromParts(2014, 8, 2, 12, 30, 0, 0, 7), 'd35c9d78-f9cf-4f52-b1cc-cb9078eebdcb', 5),
('Conchúr Tihomir', DateTime2FromParts(2014, 8, 2, 9, 30, 0, 0, 7), '900335ad-e03b-4259-abc7-76aac21cedca', 6),
('Szymon Theutrich', DateTime2FromParts(2014, 2, 1, 10, 15, 0, 0, 7), 'd6c47a54-9d88-4c4a-8054-ace76764ed0d', 7),
('Nils Gotam', DateTime2FromParts(2014, 4, 3, 9, 30, 0, 0, 7), 'b085040c-7aa4-4e96-8c8f-420b2c99c920', 8),
('Frans Hevel', DateTime2FromParts(2014, 7, 3, 19, 30, 0, 0, 7), 'b7a43e91-9fb9-4fe9-ab6f-ea51ab0f94e4', 9),
('Spiros Teofil', DateTime2FromParts(2014, 11, 1, 7, 0, 0, 0, 7), '62b9602c-27b8-44ea-adbd-2748f26537af', 10),
('Kfir Caj', DateTime2FromParts(2014, 7, 3, 1, 30, 0, 0, 7), 'dfe21df3-f364-479d-a5e7-04bc5d85ad2b', 11),
('Dwight Gresham', DateTime2FromParts(2014, 8, 1, 10, 30, 0, 0, 7), '75a1ebf1-cae7-4a50-8743-32d97500f2cf', 12),
('Broen Olujimi', DateTime2FromParts(2014, 10, 3, 13, 45, 0, 0, 7), 'f9b65c74-9f91-4cfd-9248-94a53af82866', 13),
('Rüstem Hebel', DateTime2FromParts(2014, 8, 1, 12, 45, 0, 0, 7), '02ad6b15-54b0-4491-bf0f-d781b0a2c4f5', 14);

