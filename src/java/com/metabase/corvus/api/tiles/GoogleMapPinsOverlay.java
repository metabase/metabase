package com.metabase.corvus.api.tiles;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Vector;

/**
 * Created by agilliland on 3/23/15.
 */
public class GoogleMapPinsOverlay {

    public static final int TILE_SIZE = 256;
    public static final MapPoint PIXEL_ORIGIN = new MapPoint(TILE_SIZE / 2, TILE_SIZE / 2);
    public static final double PIXELS_PER_LON_DEGREE = TILE_SIZE / 360.0;
    public static final double PIXELS_PER_LON_RADIAN = TILE_SIZE / (2 * Math.PI);


    private final int numTiles;
    private final BufferedImage tile;


    public GoogleMapPinsOverlay(int zoom, ArrayList<ArrayList> points) {
        // the zoom is an integer which tells us how many tiles (256x256) are in view at the moment
        this.numTiles = 1 << zoom;

        // create an empty image to serve as our pins overlay image
        this.tile = new BufferedImage(TILE_SIZE, TILE_SIZE, BufferedImage.TYPE_INT_ARGB);

        // do the real work here
        render(points);
    }


    // given a set of lat/lon points this will update the image and render a "pin" for each point
    private void render(ArrayList<ArrayList> points) {
        Graphics g = this.tile.getGraphics();
        g.setColor(Color.red);
        try {
            for(ArrayList point : points) {
                // add a pin to the image
                double latitude = (Double) point.get(0);
                double longitude = (Double) point.get(1);

                // determine map point given our lat/long
                double SinY = this.bound(Math.sin(this.degreesToRadians(latitude)), -0.9999, 0.9999);
                MapPoint mapPoint = new MapPoint(
                        PIXEL_ORIGIN.getX() + (longitude * PIXELS_PER_LON_DEGREE),
                        PIXEL_ORIGIN.getY() + 0.5 * Math.log((1 + SinY) / (1 - SinY)) * (PIXELS_PER_LON_RADIAN * -1));

                // determine pixel location of our map point
                MapPixel mapPixel = new MapPixel(
                        (int) Math.floor(mapPoint.getX() * numTiles),
                        (int) Math.floor(mapPoint.getY() * numTiles));

                // convert map pixel to tile pixel
                MapPixel tilePixel = new MapPixel(
                        mapPixel.getX() % TILE_SIZE,
                        mapPixel.getY() % TILE_SIZE);

                // now draw a "pin" at the given tile pixel location
                g.fillOval(tilePixel.getX(), tilePixel.getY(), 5, 5);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        } finally {
            g.dispose();
        }
    }


    // return our image as a byte[] array.  makes it easy to serialize to any other input stream desired.
    public byte[] toByteArray() {
        ByteArrayOutputStream baos = null;
        try {
            baos = new ByteArrayOutputStream();
            ImageIO.write(this.tile, "png", baos);
            baos.flush();
            return baos.toByteArray();
        } catch(IOException e) {
            return new byte[0];
        } finally {
            if (baos != null) {
                try {
                    baos.close();
                } catch (Exception ex) {}
            }
        }
    }


    // make sure the given value stays within a given min/max range.
    private double bound(double val, double min_val, double max_val) {
        return Math.min(Math.max(val, min_val), max_val);
    }

    private double degreesToRadians(double deg) {
        return deg * (Math.PI / 180);
    }

    private double radiansToDegrees(double rad) {
        return rad / (Math.PI / 180);
    }

}
