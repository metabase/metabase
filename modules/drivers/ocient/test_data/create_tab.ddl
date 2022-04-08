DROP TABLE public.users;
CREATE TABLE public.users (
    datetime         TIMESTAMP default 0 TIME KEY BUCKET(1, DAY)  NOT NULL,
    id               smallint not null,
    name             varchar(126976)  NOT NULL,
    last_login       timestamp not null,
    password         varchar(126976)  NOT NULL,
    CLUSTERING INDEX "idx01" ("id")
);

DROP TABLE public.categories;
CREATE TABLE public.categories (
    datetime         TIMESTAMP default 0 TIME KEY BUCKET(1, DAY)  NOT NULL,
    id               smallint not null,
    name             varchar(126976)  NOT NULL,
    CLUSTERING INDEX "idx01" ("id")
);

DROP TABLE public.venues;
CREATE TABLE public.venues (
    datetime         TIMESTAMP default 0 TIME KEY BUCKET(1, DAY)  NOT NULL,
    id               smallint not null,
    name             varchar(126976)  NOT NULL,
    latitude         float not null,
    longitude        float not null,
    price            float not null,
    category_id      smallint not null,
    CLUSTERING INDEX "idx01" ("id")
);

DROP TABLE public.checkins;
CREATE TABLE public.checkins (
    datetime         TIMESTAMP default 0 TIME KEY BUCKET(1, DAY)  NOT NULL,
    id               smallint not null,
    user_id          smallint not null,
    venue_id         smallint not null,
    date             date not null,
    CLUSTERING INDEX "idx01" ("id")
);
