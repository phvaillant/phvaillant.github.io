//declare the filters variable
var mode = Array.apply(0, Array(5)).map(function (x, y) { return y + 1; });
var purpose = Array.apply(0, Array(4)).map(function (x, y) { return y + 1; });
var hour = Array.apply(0, Array(24)).map(function (x, y) { return y; });
var geoid_filter;

$(document).ready(function(){

  //make sure everything is checked when refresh
  d3.selectAll('input').property('checked', true);

  //declare map
  map = new L.Map('map_canvas', {zoomControl:true});

  //declare layer to add
  var here = new L.tileLayer('http://{s}.{base}.maps.cit.api.here.com/maptile/2.1/{type}/{mapID}/{scheme}/{z}/{x}/{y}/{size}/{format}?app_id={app_id}&app_code={app_code}&lg={language}', {
       attribution: 'Map &copy; 2016 <a href="http://developer.here.com">HERE</a>',
       subdomains: '1234',
       base: 'aerial',
       type: 'maptile',
       scheme: 'terrain.day',
       app_id: '4OSXs0XhUV9zKdoPwfkt',
       app_code: 'crSpfyqk8_qFpG8hnqNz-A',
       mapID: 'newest',
       maxZoom: 14,
       minZoom:11,
       language: 'eng',
       format: 'png8',
       size: '256'
    });
  
  //setting view and adding layer
  map.setView(new L.LatLng(47.619, -122.332),11);
  map.addLayer(here);

  var svg_map = d3.select(map.getPanes().overlayPane).append("svg"),
      g_map = svg_map.append("g").attr("class", "leaflet-zoom-hide");

  d3.queue()
    .defer(d3.json, "tracts_seattle_v2.json")
    .defer(d3.csv, "trips_seattle_modified.csv")
    .await(ready);

  function ready(error, tracts_seattle_v2, trips_seattle_modified) {

    if (error) throw error;

    collection = topojson.feature(tracts_seattle_v2, tracts_seattle_v2.objects.stdin);

    var transform = d3.geoTransform({point: projectPoint}),
          path = d3.geoPath().projection(transform);

    var mapFeatures = g_map.append('g')
              .attr('class', 'features');

    //map by tarct id
    var tractById = d3.map();

    var tracts = mapFeatures.selectAll('g')
                  .data(collection.features)
                  .enter().append('g')
                    .attr('class',"tract")
                    //add information for each tract: geoid, incoming and outgoing trips (list), total trips, and position of centroid
                    .each(function(d) {
                      tractById.set(d.properties.GEOID10, d);
                      d.incoming = [];
                      d.outgoing = [];
                      d.total_trips = 0;
                      var position = path.centroid(d);
                      d.x = position[0];
                      d.y = position[1];
                   }); //end of each tracts function

    tracts.append("path")
              .attr("class","tract_cell")
              .attr("d",path)

    //filter by: exclude intra-tract flows, mode, purpose, time start
    trips = trips_seattle_modified.filter(function(d) {return ((d.o_tract != d.d_tract) & (mode.indexOf(+d.mode) != -1) & (purpose.indexOf(+d.d_purpose)!= -1) & (hour.indexOf(+d.time_start_hhmm) != -1))});

    //grouping by origin and destination tract and summing number of trips
    var trips_count = d3.nest()
            .key(function(d) { return d.o_tract; })
            .key(function(d) { return d.d_tract; })
            .rollup(function(trips) { return d3.sum(trips, function(d) {return d.count}) })
            .entries(trips);

    var max_weight = 0;

    //processing data: getting links, max weight for one link, and the total of trips
    trips_count.forEach(function(d) {
                    var source = tractById.get(d.key);
                    d.values.forEach(function(d) {
                      max_weight = Math.max(max_weight, d.value);
                      var target = tractById.get(d.key);
                      link = {source: source, target: target, weight: d.value};
                      //in d3 v4 value instead of values
                      source.total_trips += d.value;
                      source.outgoing.push(link);
                      target.incoming.push(link);
                    });
                  });

    //specifying line scale
    var lineScale = d3.scaleLinear()
          .domain([0, max_weight])
          .range([0.2, 20]);

    //drawing lines for flows
    tracts.append("g")
          .attr("class","tract_links")
          .selectAll("line")
          .data(function(d) {return d.outgoing})
              .enter().append("line")
              .attr("class","tract_link")
              .attr("x1", function(d) { return d.source.x})
              .attr("x2", function(d) { return d.target.x})
              .attr("y1", function(d) { return d.source.y})
              .attr("y2", function(d) { return d.target.y})
              .attr("stroke","gray")
              .attr("stroke-width", function(d) {return lineScale(d.weight)});

    var tooltip_id_1 = d3.select('#tooltip_1_id');
    var tooltip_details_1 = d3.select('#tooltip_1_detail');
    var tooltip_id_2 = d3.select('#tooltip_2_id');
    var tooltip_details_2 = d3.select('#tooltip_2_detail');

    //variable to store tract clicked
    var tract_clicked = 0;
    var second_tooltip = false;

    function projectPoint(x, y) {
          var point = map.latLngToLayerPoint(new L.LatLng(y, x));
          this.stream.point(point.x, point.y);
    } //end of project point function

    //change position of svg when resize or zoom
    map.on("viewreset", reset);
    map.on("zoom", reset);
    reset();

    function reset() {

      var bounds = path.bounds(collection),
        topLeft = bounds[0],
        bottomRight = bounds[1];

      svg_map.attr("width", bottomRight[0] - topLeft[0])
          .attr("height", bottomRight[1] - topLeft[1])
          .style("left", topLeft[0] + "px")
          .style("top", topLeft[1] + "px");

      g_map.attr("transform", "translate(" + -topLeft[0] + "," + -topLeft[1] + ")");

      tracts.selectAll('path').attr("d", path);
      //update position of tracts
      tracts.each(function(d) {
        var position = path.centroid(d);
        d.x = position[0];
        d.y = position[1];
      });

      //redraw the lines
      tracts.selectAll('line').attr("x1", function(d) { return d.source.x})
              .attr("x2", function(d) { return d.target.x})
              .attr("y1", function(d) { return d.source.y})
              .attr("y2", function(d) { return d.target.y})
              .attr("stroke","gray")
              .attr("stroke-width", function(d) {return lineScale(d.weight)});


    } //end of reset function

    function updateMap() {

          var tractById = d3.map();

          tracts.data(collection.features)
                .each(function(d) {
                      tractById.set(d.properties.GEOID10, d);
                            d.incoming = [];
                            d.outgoing = [];
                            d.total_trips = 0;
                            var position = path.centroid(d);
                            d.x = position[0];
                            d.y = position[1];
                   });

          trips = trips_seattle_modified.filter(function(d) {return ((d.o_tract != d.d_tract) & (mode.indexOf(+d.mode) != -1) & (purpose.indexOf(+d.d_purpose)!= -1)  & (hour.indexOf(+d.time_start_hhmm) != -1))})


          var trips_count = d3.nest()
              .key(function(d) { return d.o_tract; })
              .key(function(d) { return d.d_tract; })
              .rollup(function(trips) { return d3.sum(trips, function(d) {return d.count}) })
              .entries(trips);

          var max_weight = 0;

          trips_count
              .forEach(function(d) {
                      var source = tractById.get(d.key);
                      d.values.forEach(function(d) {
                        max_weight = Math.max(max_weight, d.value);
                        var target = tractById.get(d.key);
                        link = {source: source, target: target, weight: d.value};
                        source.total_trips += d.value;
                        source.outgoing.push(link);
                        target.incoming.push(link);
                      });
                    });

          //data has changed so refresh the values of the tooltip
          d3.selectAll('path')
            .on("mouseover", function(d) {
                    if (second_tooltip) {
                      tooltip_id_2.classed('hidden', false)
                            .html("GEOID: " + d.properties.GEOID10);
                      var outgoing_trips = trips_count.filter(function(a) {return a.key==tract_clicked})[0].values.filter(function(a) {return a.key==d.properties.GEOID10})[0];
                      outgoing_trips ? outgoing_trips = outgoing_trips.value : outgoing_trips = 0;
                      tooltip_details_2.classed('hidden', false)
                            .html("Trips to this tract: " + outgoing_trips);
                    }
                    else {
                      tooltip_id_1.classed('hidden', false)
                            .html("GEOID: " + d.properties.GEOID10);
                      tooltip_details_1.classed('hidden', false)
                            .html("Total outgoing trips: " + d.total_trips);
                    }
            })

          var lineScale = d3.scaleLinear()
            .domain([0, max_weight])
            .range([0.2, 20]);

          tracts.selectAll("line")
                      .remove();

          tracts.selectAll("g")
                    .selectAll("line")
                    .data(function(d) {return d.outgoing})
                    .enter().append("line")
                      .attr("class","tract_link")
                      .attr("x1", function(d) { return d.source.x})
                      .attr("x2", function(d) { return d.target.x})
                      .attr("y1", function(d) { return d.source.y})
                      .attr("y2", function(d) { return d.target.y})
                      .attr("stroke","gray")
                      .attr("stroke-width", function(d) {return lineScale(d.weight)});

          //update tooltip value
          tooltip_details_1.html("Total outgoing trips: " + d3.selectAll(".tract_clicked").datum().total_trips);

      } //end of update map function

    var margin = {top: 0, right: 15, bottom: 30, left: 45};
    var width = parseInt(d3.select('#barchart').style('width')) - margin.left - margin.right;
    var height = parseInt(d3.select('#barchart').style('height')) - margin.top - margin.bottom;

    d3.csv('trips_seattle_modified.csv', function(error, data) {

        var hours = ["12 AM","1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM"];

        d3.selectAll('path')
          .on('click', function(d) {
            tracts.selectAll(".tract_clicked").classed("tract_clicked", false);
            tracts.selectAll(".links_clicked").attr("class","tract_links");
            if(tract_clicked != d.properties.GEOID10) {
              d3.select(this).classed("tract_clicked", true);
              d3.select(this.parentNode).selectAll("g").attr("class","links_clicked");
              tracts.selectAll(".tract_links").classed("hidden", true);
              tract_clicked = d.properties.GEOID10;
              tooltip_id_1.classed('hidden', false)
                            .html("GEOID: " + d.properties.GEOID10);
              tooltip_details_1.classed('hidden', false)
                            .html("Total outgoing trips: " + d.total_trips);
              second_tooltip = true;
              geoid_filter = true;
              updateBar();
            }
            else {
              geoid_filter = false;
              updateBar();
              tracts.selectAll(".tract_links").classed("hidden", false);
              tract_clicked = 0;
              second_tooltip = false;
              tooltip_id_2.classed('hidden', true);
              tooltip_details_2.classed('hidden', true);
            }
          })
          .on("mouseover", function(d) {
                    if (second_tooltip) {
                      tooltip_id_2.classed('hidden', false)
                            .html("GEOID: " + d.properties.GEOID10);
                      var outgoing_trips = trips_count.filter(function(a) {return a.key==tract_clicked})[0].values.filter(function(a) {return a.key==d.properties.GEOID10})[0];
                      outgoing_trips ? outgoing_trips = outgoing_trips.value : outgoing_trips = 0;
                      tooltip_details_2.classed('hidden', false)
                            .html("Trips to this tract: " + outgoing_trips);
                    }
                    else {
                      tooltip_id_1.classed('hidden', false)
                            .html("GEOID: " + d.properties.GEOID10);
                      tooltip_details_1.classed('hidden', false)
                            .html("Total outgoing trips: " + d.total_trips);
                    }
          })
          .on('mouseout', function() {
                    if (second_tooltip) {
                      tooltip_id_2.classed('hidden', true);
                      tooltip_details_2.classed('hidden', true);
                    }
                    else {
                      tooltip_id_1.classed('hidden', true);
                      tooltip_details_1.classed('hidden', true);
                    }
          });

        var dataset = Array(24).fill(0);

        //exclude filtered mode and purpose
        data.forEach(function(d) {
            if ((mode.indexOf(+d.mode) != -1) & (purpose.indexOf(+d.d_purpose) != -1)) {
                dataset[+d.time_start_hhmm] += +d.count
            }
        });

        var svg_bar = d3.select("#barchart").append("svg")
                        .attr("id","svg_bar")
                        .attr("width", width + margin.left + margin.right)
                        .attr("height", height + margin.top + margin.bottom);

        bar = svg_bar.append("g")
                .attr("class","chart")
                .attr("transform", 
                    "translate(" + margin.left + "," + margin.top + ")");

        var xScale = d3.scaleBand()
            .domain(d3.range(dataset.length))
            .range([0, width]);

        var yScale = d3.scaleLinear()
            .range([height, 0])
            .domain([0, d3.max(dataset)]);

         // append the rectangles for the bar chart
        bar.selectAll(".bar")
                .data(dataset)
              .enter().append("rect")
                .attr("class", "bar")
                .attr("x", function(d,i) { return xScale(i); })
                .attr("width", xScale.bandwidth())
                .attr("y", function(d) { return yScale(d); })
                .attr("height", function(d) { return height - yScale(d); })
                .on("click", function(d,i) {
                  if (hour.length == 24) {
                     if (d3.select(this).classed("highlighted")) {
                        hour.splice(hour.indexOf(i),1);
                        d3.select(this).classed("highlighted",false);
                     }
                     else {
                        hour = [i];
                        d3.select(this).classed("highlighted",true);
                     }
                  }
                  else {
                    if (d3.select(this).classed("highlighted")) {
                      hour.splice(hour.indexOf(i),1);
                      d3.select(this).classed("highlighted",false);
                      if (hour.length==0) {
                        hour = Array.apply(0, Array(24)).map(function (x, y) { return y; });
                      }
                    }
                    else {
                      hour.push(i);
                      d3.select(this).classed("highlighted",true);
                    }
                  }
                  updateMap();
                }); //end of on click function

          bar.append("g")
            .attr("class","yaxis")
            .call(d3.axisLeft(yScale));

          bar.append("g")
            .attr("class","xaxis")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(xScale));

        function updateBar() {

            dataset = Array(24).fill(0);

            data.forEach(function(d) {
              if ((mode.indexOf(+d.mode) != -1) & (purpose.indexOf(+d.d_purpose)!= -1)) {
                  if (geoid_filter) {
                    if ((d.o_tract == tract_clicked)) {
                      dataset[+d.time_start_hhmm] += +d.count
                    }
                  }
                  else {
                    dataset[+d.time_start_hhmm] += +d.count
                  }  
              }
           });

            var xScale = d3.scaleBand()
            .domain(d3.range(dataset.length))
            .range([0, width]);

            var yScale = d3.scaleLinear()
            .range([height, 0])
            .domain([0, d3.max(dataset)]);

            d3.select("#barchart")
              .transition();

           bar.selectAll("rect")
              .data(dataset)
              .attr("x", function(d, i) {
                   return xScale(i);
               })
              .attr("y", function(d) {
                   return yScale(d);
               })
              .attr("width", xScale.bandwidth())
              .attr("height", function(d) {
                return height - yScale(d);
              });

          bar.select(".yaxis")
              .call(d3.axisLeft(yScale));

        } //end of updatebar function

        d3.select('#mode_filter')
          .selectAll('input').on("change", function() {
            if (this.checked) {
              mode.push(+this.value)
            }
            else {
              mode.splice(mode.indexOf(+this.value),1)
            }
            updateBar();
            updateMap();
          });

      d3.select('#purpose_filter')
        .selectAll('input').on("change", function() {
          if (this.checked) {
            purpose.push(+this.value)
          }
          else {
            purpose.splice(purpose.indexOf(+this.value),1)
          }
          updateBar();
          updateMap();
        });

      d3.select('#reset').on('click', function() {
        mode = Array.apply(0, Array(5)).map(function (x, y) { return y + 1; });
        purpose = Array.apply(0, Array(4)).map(function (x, y) { return y + 1; });
        hour = Array.apply(0, Array(24)).map(function (x, y) { return y; });
        geoid_filter = false;
        second_tooltip = false;
        tooltip_id_1.classed('hidden', true);
        tooltip_details_1.classed('hidden', true);
        tracts.selectAll(".tract_clicked").classed("tract_clicked", false);
        tracts.selectAll(".links_clicked").attr("class","tract_links");
        tracts.selectAll(".tract_links").classed("hidden", false);
        d3.selectAll('.bar').classed("highlighted",false);
        //make sure everything is checked when refresh
        d3.selectAll('input').property('checked', true);
        updateBar();
        updateMap();
      }); //end of reset on click function

      map.on('resize', resize_graph);
      function resize_graph() {
        console.log("something?");
        width = parseInt(d3.select('#barchart').style('width')) - margin.left - margin.right;
        height = parseInt(d3.select('#barchart').style('height')) - margin.top - margin.bottom;

        xScale.range([0, width]);

        yScale.range([height, 0]);

         svg_bar.attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

         bar.attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom);

         bar.selectAll(".bar")
              .attr("x", function(d,i) { return xScale(i); })
              .attr("width", xScale.bandwidth())
              .attr("y", function(d) { return yScale(d); })
              .attr("height", function(d) { return height - yScale(d); })

         bar.select(".xaxis").attr("transform", "translate(0," + height + ")")
                .call(d3.axisBottom(xScale));

         bar.select(".yaxis").call(d3.axisLeft(yScale));

      } // end of resize graph  function

    }); //end of load csv function

  } //end of ready function

}); //end of document ready function