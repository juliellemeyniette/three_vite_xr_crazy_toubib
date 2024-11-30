"use strict";

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

// import {
//   PerspectiveCamera,
//   Scene,
//   WebGLRenderer,
//   BoxGeometry,
//   Mesh,
//   MeshNormalMaterial,
//   AmbientLight,
//   Clock
// } from 'three';

// If you prefer to import the whole library, with the THREE prefix, use the following line instead:
import * as THREE from 'three'

// NOTE: three/addons alias is supported by Rollup: you can use it interchangeably with three/examples/jsm/  

// Importing Ammo can be tricky.
// Vite supports webassembly: https://vitejs.dev/guide/features.html#webassembly
// so in theory this should work:
//
// import ammoinit from 'three/addons/libs/ammo.wasm.js?init';
// ammoinit().then((AmmoLib) => {
//  Ammo = AmmoLib.exports.Ammo()
// })
//
// But the Ammo lib bundled with the THREE js examples does not seem to export modules properly.
// A solution is to treat this library as a standalone file and copy it using 'vite-plugin-static-copy'.
// See vite.config.js
// 
// Consider using alternatives like Oimo or cannon-es

// import {
//   OrbitControls
// } from 'three/addons/controls/OrbitControls.js';

// import {
//   GLTFLoader
// } from 'three/addons/loaders/GLTFLoader.js';

//import * as CANNON from 'cannon-es';
import { ARButton } from 'three/addons/webxr/ARButton.js';


let container; // a dom el that has the renderED AR view
let camera, scene, renderer;
let controller; // wich will handle user input

let reticle; 

let hitTestSource = null; // ce qui décla
let hitTestSourceRequested = false;

let raycaster;



init();

function init() {
  raycaster = new THREE.Raycaster();

  container = document.createElement('div');
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  scene.background = new THREE.Color(0x000000); // Noir

  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // No organ map, so organ like colors
  const organMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.8, 0.2, 0.2),
    roughness: 0.5,
    metalness: 0.2,
    //map: organTexture
  });

  // cubes
  var cubeMesh;
  var meshes = [];
  var cubeGeo = new THREE.BoxGeometry(1, 1, 1, 10, 10);
  var cubeMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
  for (var i = 0; i < 1; i++) {
    cubeMesh = new THREE.Mesh(cubeGeo, organMaterial);
    cubeMesh.castShadow = true;
    meshes.push(cubeMesh);
    scene.add(cubeMesh);
  }


  //

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  //

  document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

  // Détecter l'entrée et la sortie du mode AR
  renderer.xr.addEventListener('sessionstart', () => {
    scene.background = null; // Fond transparent en mode AR
  });

  renderer.xr.addEventListener('sessionend', () => {
    scene.background = new THREE.Color(0x000000); // Fond noir hors mode AR
  });

  //

  function onSelect() {

    if (reticle.visible) {

      const material = new THREE.MeshPhongMaterial({ color: 0xffffff * Math.random() });
      const mesh = new THREE.Mesh(cubeGeo, material);
      reticle.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.scale.y = Math.random() * 2 + 1;
      scene.add(mesh);

    }

  }

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(- Math.PI / 2),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
  //

  window.addEventListener('resize', onWindowResize);

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}




//

function animate(timestamp, frame) {

  if (frame) {

    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (hitTestSourceRequested === false) {

      session.requestReferenceSpace('viewer').then(function (referenceSpace) {

        session.requestHitTestSource({ space: referenceSpace }).then(function (source) {

          hitTestSource = source;

        });

      });

      session.addEventListener('end', function () {

        hitTestSourceRequested = false;
        hitTestSource = null;

      });

      hitTestSourceRequested = true;

    }

    if (hitTestSource) {

      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length) {

        const hit = hitTestResults[0];

        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

      } else {

        reticle.visible = false;

      }

    }

  }

  renderer.render(scene, camera);

}