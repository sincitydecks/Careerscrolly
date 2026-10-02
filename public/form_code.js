if (window.innerWidth <= 900 && e.pointerType === 'touch') {
setTouchedSection(path, e.clientX, e.clientY);
}
}, { passive: true });
path.addEventListener('pointerup', function() {
if (window.innerWidth <= 900) {
window.setTimeout(clearStateTouchFeedback, 520);
}
}, { passive: true });
path.addEventListener('pointercancel', clearStateTouchFeedback, { passive: true });
});

// Spatial Slide logic
var spatialGoFurtherBtn = document.getElementById('spatialGoFurtherBtn');
var spatialBackBtn = document.getElementById('spatialBackBtn');
var eoiSlideTrack = document.getElementById('eoiSlideTrack');

if (spatialGoFurtherBtn && eoiSlideTrack) {
spatialGoFurtherBtn.addEventListener('click', function() {
eoiSlideTrack.classList.add('active');
});
