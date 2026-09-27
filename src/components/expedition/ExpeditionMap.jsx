import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Custom Leaflet Icons for Expedition Markers
function createCustomPin(color, iconEmoji, isPulse = false) {
  return L.divIcon({
    className: "custom-expedition-marker",
    html: `
      <div style="
        position: relative;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${color};
        color: white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        border: 2px solid #ffffff;
      ">
        ${isPulse ? '<div style="position:absolute; inset:-6px; border-radius:50%; border:2px solid ' + color + '; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>' : ''}
        <span style="
          transform: rotate(45deg);
          font-size: 16px;
          line-height: 1;
        ">${iconEmoji}</span>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -36]
  });
}

export default function ExpeditionMap({
  stops = [],
  currentGps = null,
  selectedStop = null,
  onStopSelect = null,
  height = "420px"
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);
  const gpsMarkerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center in Bangladesh (Dhaka / Sylhet midpoint)
    const initialCenter = [24.3, 91.2];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 8,
      zoomControl: true,
      scrollWheelZoom: true
    });

    // High quality OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers, Route Polyline, and Bounds
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    if (gpsMarkerRef.current) {
      map.removeLayer(gpsMarkerRef.current);
      gpsMarkerRef.current = null;
    }

    const validStops = stops
      .map((s, idx) => ({
        ...s,
        id: s.id || `map_stop_${idx}`,
        lat: Number(s.lat ?? s.latitude),
        lng: Number(s.lng ?? s.longitude),
        placeName: s.placeName || s.place_name || s.name || s.location || `Stop ${idx + 1}`
      }))
      .filter(s => !isNaN(s.lat) && !isNaN(s.lng) && s.lat !== 0 && s.lng !== 0);
    const latLngs = [];

    validStops.forEach((stop, idx) => {
      latLngs.push([stop.lat, stop.lng]);

      let pinColor = "#3b82f6"; // Blue for pending
      let pinEmoji = `${idx}`;
      let isPulse = false;

      if (stop.isDeparture || (idx === 0 && stop.placeId === "origin_start")) {
        pinColor = "#10b981"; // Emerald Green for Departure
        pinEmoji = "🚩";
        isPulse = true;
      } else if (stop.isReturn || (idx === validStops.length - 1 && stop.placeId === "origin_return")) {
        pinColor = "#8b5cf6"; // Purple for Return / Finish
        pinEmoji = "🏁";
        isPulse = true;
      } else if (stop.isSpontaneous) {
        pinColor = "#f59e0b"; // Gold / Amber
        pinEmoji = "🌟";
        isPulse = true;
      } else if (stop.status === "checked_in") {
        pinColor = "#10b981"; // Emerald green
        pinEmoji = "✓";
      } else if (stop.status === "skipped") {
        pinColor = "#6b7280"; // Slate gray
        pinEmoji = "✕";
      } else if (idx === validStops.findIndex(s => s.status === "pending")) {
        // Next active target stop
        pinColor = "#6366f1"; // Indigo
        pinEmoji = `${idx}`;
        isPulse = true;
      }

      const icon = createCustomPin(pinColor, pinEmoji, isPulse);
      const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);

      // Popup content
      const statusBadge = stop.isDeparture || stop.placeId === "origin_start"
        ? '<span style="background:#d1fae5; color:#065f46; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">🚩 Tour Departure Point</span>'
        : stop.isReturn || stop.placeId === "origin_return"
        ? '<span style="background:#ede9fe; color:#5b21b6; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">🏁 Return Destination & Circuit Complete</span>'
        : stop.isSpontaneous
        ? '<span style="background:#fef3c7; color:#b45309; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">🌟 Spontaneous Discovery</span>'
        : stop.status === "checked_in"
        ? '<span style="background:#d1fae5; color:#065f46; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">✓ Checked In</span>'
        : stop.status === "skipped"
        ? '<span style="background:#f3f4f6; color:#4b5563; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">✕ Skipped Stop</span>'
        : '<span style="background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:10px;">⏳ Pending Stop</span>';

      const popupHtml = `
        <div style="width: 220px; font-family: system-ui, sans-serif; padding: 2px;">
          <div style="margin-bottom: 6px;">${statusBadge}</div>
          <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #111827;">${stop.placeName}</h4>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #6b7280;">📍 ${stop.location || ''}</p>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; font-size: 11px; margin-bottom: 6px;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
              <span style="color:#64748b;">Transit:</span>
              <span style="font-weight:600; color:#0f172a;">${stop.transportMode || 'Standard'}</span>
            </div>
            ${Number(stop.transportCost) > 0 ? `
            <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
              <span style="color:#64748b;">Transit Fare:</span>
              <span style="font-weight:700; color:#059669;">৳${Number(stop.transportCost).toLocaleString()} BDT</span>
            </div>` : ''}
            ${stop.hasAccommodation ? `
            <div style="display:flex; justify-content:space-between;">
              <span style="color:#64748b;">Stay:</span>
              <span style="font-weight:600; color:#0f172a;">${stop.accommodationType || 'Hotel'}</span>
            </div>` : ''}
          </div>

          ${stop.transportDetails ? `<p style="margin:0 0 6px; font-size:10px; color:#64748b; font-style:italic;">🚌 ${stop.transportDetails}</p>` : ''}
          ${stop.checkInNote ? `<p style="margin:0 0 6px; font-size:11px; font-style:italic; color:#334155;">"${stop.checkInNote}"</p>` : ''}
          ${stop.notes && !stop.checkInNote ? `<p style="margin:0 0 6px; font-size:11px; color:#475569;">${stop.notes}</p>` : ''}
          
          ${stop.photos && stop.photos[0] ? `<img src="${stop.photos[0]}" style="width:100%; height:90px; object-fit:cover; border-radius:6px; margin-bottom:4px;" alt="${stop.placeName}" />` : ''}
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on("click", () => {
        if (onStopSelect) onStopSelect(stop);
      });

      markersRef.current.push(marker);
    });

    // Draw Route Polyline
    if (latLngs.length > 1) {
      polylineRef.current = L.polyline(latLngs, {
        color: "#f97316", // Warm travel orange
        weight: 4,
        opacity: 0.85,
        dashArray: "6, 8",
        lineJoin: "round"
      }).addTo(map);
    }

    // Add Live GPS Beacon marker if available
    if (currentGps && typeof currentGps.lat === "number" && typeof currentGps.lng === "number") {
      const liveGpsIcon = L.divIcon({
        className: "live-gps-beacon",
        html: `
          <div style="position:relative; width:24px; height:24px;">
            <div style="position:absolute; inset:0; border-radius:50%; background:#ef4444; opacity:0.35; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position:absolute; inset:3px; border-radius:50%; background:#ef4444; border:2px solid #ffffff; box-shadow:0 0 8px rgba(239,68,68,0.8);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      gpsMarkerRef.current = L.marker([currentGps.lat, currentGps.lng], { icon: liveGpsIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui; font-size:12px; padding:2px;">
            <b style="color:#ef4444;">🔴 Live Expedition Beacon</b>
            <p style="margin:2px 0 0; color:#64748b; font-size:10px;">Last updated: ${currentGps.lastUpdated || 'Live'}</p>
          </div>
        `);
    }

    // Auto fit map bounds if we have points
    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      if (currentGps && typeof currentGps.lat === "number") {
        bounds.extend([currentGps.lat, currentGps.lng]);
      }
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    }
  }, [stops, currentGps, onStopSelect]);

  // Center on selected stop if changed
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedStop || !selectedStop.lat) return;
    mapInstanceRef.current.setView([selectedStop.lat, selectedStop.lng], 12, { animate: true });
  }, [selectedStop]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-base-300 bg-base-200">
      <div ref={mapContainerRef} style={{ width: "100%", height: height }} />
      
      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[400] bg-base-100/90 backdrop-blur-md px-3 py-2 rounded-xl border border-base-300 shadow-md text-[11px] flex flex-wrap items-center gap-3">
        <span className="font-bold text-base-content/80">Legend:</span>
        <span className="flex items-center gap-1 font-semibold text-emerald-600">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Checked In
        </span>
        <span className="flex items-center gap-1 font-semibold text-indigo-500">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Current Target
        </span>
        <span className="flex items-center gap-1 font-semibold text-amber-500">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Spontaneous Gem
        </span>
        <span className="flex items-center gap-1 font-semibold text-base-content/60">
          <span className="w-2.5 h-2.5 rounded-full bg-base-content/40"></span> Upcoming
        </span>
      </div>
    </div>
  );
}
